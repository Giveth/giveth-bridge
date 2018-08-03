import logger from 'winston';
import { LiquidPledging } from 'giveth-liquidpledging';
import getGasPrice from './gasPrice';
import { sendEmail } from './utils';
import ForeignGivethBridge from './ForeignGivethBridge';

export default class Verifier {
    constructor(homeWeb3, foreignWeb3, nonceTracker, config, db) {
        this.homeWeb3 = homeWeb3;
        this.foreignWeb3 = foreignWeb3;
        this.nonceTracker = nonceTracker;
        this.db = db;
        this.config = config;
        this.lp = new LiquidPledging(foreignWeb3, config.liquidPledging);
        this.foreignBridge = new ForeignGivethBridge(foreignWeb3, config.foreignBridge);
        this.currentHomeBlockNumber = undefined;
        this.currentForeignBlockNumber = undefined;
        this.account = homeWeb3.eth.accounts.wallet[0];
    }

    /* istanbul ignore next */
    start() {
        const intervalId = setInterval(() => this.verify(), this.config.pollTime);
        this.verify();
    }

    verify() {
        return Promise.all([
            this.homeWeb3.eth.getBlockNumber(),
            this.foreignWeb3.eth.getBlockNumber(),
        ])
            .then(([homeBlockNumber, foreignBlockNumber]) => {
                this.currentHomeBlockNumber = homeBlockNumber;
                this.currentForeignBlockNumber = foreignBlockNumber;

                return Promise.all([this.getFailedSendTxs(), this.getPendingTxs()]);
            })
            .then(([failedTxs, pendingTxs]) => {
                const failedPromises = failedTxs.map(tx => this.verifyTx(tx));
                const pendingPromises = pendingTxs.map(tx => this.verifyTx(tx));

                if (this.config.isTest) {
                    return Promise.all([...failedPromises, ...pendingPromises]);
                }
            })
            .catch(err => console.error('Failed to fetch block number ->', err));
    }

    verifyTx(tx) {
        const web3 = tx.toHomeBridge ? this.homeWeb3 : this.foreignWeb3;
        const currentBlock = tx.toHomeBridge
            ? this.currentHomeBlockNumber
            : this.currentForeignBlockNumber;
        const confirmations = tx.toHomeBridge
            ? this.config.homeConfirmations
            : this.foreignConfirmations;

        // order matters here
        const txHash =
            tx.reSendGiverTxHash ||
            tx.reSendReceiverTxHash ||
            tx.reSendCreateGiverTxHash ||
            tx.txHash;

        if (tx.status === 'pending') {
            return web3.eth
                .getTransactionReceipt(txHash)
                .then(receipt => {
                    if (!receipt) return; // not mined

                    // only update if we have enough confirmations
                    if (currentBlock - receipt.blockNumber <= confirmations) return;

                    if (
                        receipt.status === true ||
                        receipt.status === '0x01' ||
                        receipt.status === '0x1' ||
                        receipt.status === 1
                    ) {
                        // this was a createGiver tx, we still need to transfer the funds to the giver
                        if (txHash === tx.reSendCreateGiverTxHash) {
                            // GiverAdded event topic
                            const { topics } = receipt.logs.find(
                                l =>
                                    l.topics[0] ===
                                    '0xad9c62a4382fd0ddbc4a0cf6c2bc7df75b0b8beb786ff59014f39daaea7f232f',
                            );
                            tx.giverId = this.homeWeb3.utils.hexToNumber(topics[1]); // idGiver is 1st indexed param, thus 2nd topic
                            // we call handleFailedTx b/c this is still a failed tx. It is just multi-step b/c we needed to create a
                            // giver.
                            logger.debug('successfully created a giver ->', tx.giverId);
                            return this.handleFailedTx(tx);
                        }
                        this.updateTxData(
                            Object.assign(tx, {
                                status: 'confirmed',
                            }),
                        );
                        return;
                    }

                    return this.handleFailedTx(tx);
                })
                .catch(err => {
                    // ignore unknown tx b/c it is probably too early to check
                    if (!err.message.includes('unknown transaction')) {
                        logger.error('Failed to fetch tx receipt for tx', tx, err);
                    }
                });
        } else if (tx.status === 'failed-send') {
            return this.handleFailedTx(tx);
        } else {
            sendEmail(this.config, `Unknown tx status \n\n ${JSON.stringify(tx, null, 2)}`);
            logger.error('Unknown tx status ->', tx);
        }
    }

    handleFailedTx(tx) {
        const web3 = tx.toHomeBridge ? this.homeWeb3 : this.foreignWeb3;

        const handleFailedReceiver = () =>
            this.fetchAdmin(tx.receiverId).then(admin => {
                logger.debug('handling failed receiver ->', tx.receiverId, admin, tx);
                if (!admin || admin.adminType === '0') {
                    // giver
                    return this.sendToGiver(tx);
                } else if (admin.adminType === '1') {
                    // delegate
                    if (tx.reSendCreateGiver && !tx.reSendReceiver) {
                        // giver failed, so try to send to receiver now
                        return this.sendToReceiver(tx, tx.receiverId);
                    }
                    return this.sendToGiver(tx);
                } else if (admin.adminType === '2') {
                    // project
                    // check if there is a parentProject we can send to if project is canceled
                    return this.getParentProjectNotCanceled(tx.receiverId).then(projectId => {
                        if (
                            !projectId ||
                            (projectId === tx.receiverId &&
                                (!tx.reSendCreateGiver || tx.reSendReceiver)) ||
                            projectId == 0
                        )
                            return this.sendToGiver(tx);

                        return this.sendToReceiver(tx, projectId);
                    });
                } else {
                    // shouldn't get here
                    sendEmail(
                        this.config,
                        `Unknown receiver adminType \n\n ${JSON.stringify(tx, null, 2)}`,
                    );
                    logger.error('Unknown receiver adminType ->', tx);
                }
            });

        if (tx.toHomeBridge) {
            // this shouldn't fail, send email as we need to investigate
            sendEmail(
                this.config,
                `AuthorizePayment tx failed toHomeBridge \n\n ${JSON.stringify(tx, null, 2)}`,
            );
            logger.error('AuthorizePayment tx failed toHomeBridge ->', tx);
        } else {
            // check that the giver is valid
            // if we don't have a giverId, we don't need to fetch the admin b/c this was a
            // donateAndCreateGiver call and we need to handle the failed receiver
            return (tx.giverId ? this.fetchAdmin(tx.giverId) : Promise.resolve(true)).then(
                giverAdmin => (giverAdmin ? handleFailedReceiver() : this.createGiver(tx)),
            );
        }
    }

    fetchAdmin(id) {
        return this.lp.getPledgeAdmin(id).catch(e => {
            // receiver may not exist, catch error and pass undefined
            logger.debug('Failed to fetch pledgeAdmin for adminId ->', id, e);
        });
    }

    sendToGiver(tx) {
        logger.debug('send to Giver');
        // already attempted to send to giver, notify of failure
        if (tx.reSendGiver) {
            this.updateTxData(Object.assign(tx, { status: 'failed' }));
            sendEmail(
                this.config,
                `ForeignBridge sendToGiver  Tx failed. NEED TO TAKE ACTION \n\n${JSON.stringify(
                    tx,
                    null,
                    2,
                )}`,
            );
            logger.error('ForeignBridge sendToGiver Tx failed. NEED TO TAKE ACTION ->', tx);
            return;
        }

        if (!tx.giver && !tx.giverId) {
            sendEmail(
                this.config,
                `Tx missing giver and giverId. Can't sendToGiver \n\n ${JSON.stringify(
                    tx,
                    null,
                    2,
                )}`,
            );
            logger.error('Tx missing giver and giverId. Cant sendToGiver ->', tx);
            return;
        }

        if (tx.giver && !tx.giverId) return this.createGiver(tx);

        const data = this.lp.$contract.methods
            .donate(tx.giverId, tx.giverId, tx.sideToken, tx.amount)
            .encodeABI();

        let nonce;
        let txHash;
        return this.nonceTracker
            .obtainNonce()
            .then(n => {
                nonce = n;
                return getGasPrice(this.config, false);
            })
            .then(gasPrice =>
                this.foreignBridge.bridge
                    .deposit(tx.sender, tx.mainToken, tx.amount, tx.homeTx, data, {
                        from: this.account.address,
                        nonce,
                        gasPrice,
                        $extraGas: 100000,
                    })
                    .on('transactionHash', transactionHash => {
                        this.nonceTracker.releaseNonce(nonce);
                        this.updateTxData(
                            Object.assign(tx, {
                                status: 'pending',
                                reSend: true,
                                reSendGiver: true,
                                reSendGiverTxHash: transactionHash,
                            }),
                        );
                        txHash = transactionHash;
                    })
                    .catch((err, receipt) => {
                        logger.debug('ForeignBridge resend tx error ->', err, receipt, txHash);

                        // if we have a txHash, then we will pick on the next run
                        if (!txHash) {
                            this.nonceTracker.releaseNonce(nonce, false, false);
                            this.updateTxData(
                                Object.assign(tx, {
                                    status: 'failed-send',
                                    reSend: true,
                                    reSendGiverTxHash: false,
                                    reSendGiver: true,
                                    reSendGiverError: err,
                                }),
                            );
                        }
                    }),
            );
    }

    createGiver(tx) {
        if (tx.reSendCreateGiver) {
            this.updateTxData(Object.assign(tx, { status: 'failed' }));
            sendEmail(
                this.config,
                `ForeignBridge createGiver Tx failed. NEED TO TAKE ACTION \n\n${JSON.stringify(
                    tx,
                    null,
                    2,
                )}`,
            );
            logger.error('ForeignBridge createGiver Tx failed. NEED TO TAKE ACTION ->', tx);
            return;
        }

        let nonce;
        let txHash;
        return this.nonceTracker
            .obtainNonce()
            .then(n => {
                nonce = n;
                return getGasPrice(this.config, false);
            })
            .then(gasPrice =>
                this.lp
                    .addGiver(tx.giver || tx.sender, '', '', 259200, 0, {
                        from: this.account.address,
                        nonce,
                        gasPrice,
                        $extraGas: 100000,
                    })
                    .on('transactionHash', transactionHash => {
                        this.nonceTracker.releaseNonce(nonce);
                        this.updateTxData(
                            Object.assign(tx, {
                                status: 'pending',
                                reSend: true,
                                reSendCreateGiver: true,
                                reSendCreateGiverTxHash: transactionHash,
                            }),
                        );
                        txHash = transactionHash;
                    })
                    .catch((err, receipt) => {
                        logger.debug(
                            'ForeignBridge resend createGiver tx error ->',
                            err,
                            receipt,
                            txHash,
                        );

                        // if we have a txHash, then we will pick on the next run
                        if (!txHash) {
                            this.nonceTracker.releaseNonce(nonce, false, false);
                            this.updateTxData(
                                Object.assign(tx, {
                                    status: 'failed-send',
                                    reSend: true,
                                    reSendCreateGiverError: err,
                                    reSendCreateGiverTxHash: false,
                                    reSendCreateGiver: true,
                                }),
                            );
                        }
                    }),
            );
    }

    sendToReceiver(tx, newReceiverId) {
        if (tx.receiverId !== newReceiverId) {
            if (!tx.attemptedReceiverIds) tx.attemptedReceiverIds = [tx.receiverId];
            tx.attemptedReceiverIds.push(newReceiverId);
        }
        tx.receiverId = newReceiverId;

        if (!tx.giver && !tx.giverId) {
            sendEmail(
                this.config,
                `Tx missing giver and giverId. Can't sendToParentProject\n\n ${JSON.stringify(
                    tx,
                    null,
                    2,
                )}`,
            );
            logger.error('Tx missing giver and giverId. Cant sendToParentProject ->', tx);
            return;
        }

        let data;
        if (tx.giver) {
            data = this.lp.$contract.methods
                .addGiverAndDonate(tx.receiverId, tx.giver, tx.sideToken, tx.amount)
                .encodeABI();
        } else {
            data = this.lp.$contract.methods
                .donate(tx.giverId, tx.receiverId, tx.sideToken, tx.amount)
                .encodeABI();
        }

        let nonce;
        let txHash;
        return this.nonceTracker
            .obtainNonce()
            .then(n => {
                nonce = n;
                return getGasPrice(this.config);
            })
            .then(gasPrice =>
                this.foreignBridge.bridge
                    .deposit(tx.sender, tx.mainToken, tx.amount, tx.homeTx, data, {
                        from: this.account.address,
                        nonce,
                        gasPrice,
                        $extraGas: 100000,
                    })
                    .on('transactionHash', transactionHash => {
                        this.nonceTracker.releaseNonce(nonce);
                        this.updateTxData(
                            Object.assign(tx, {
                                status: 'pending',
                                reSend: true,
                                reSendReceiver: true,
                                reSendReceiverTxHash: transactionHash,
                            }),
                        );
                        txHash = transactionHash;
                    })
                    .catch((err, receipt) => {
                        logger.debug('ForeignBridge resend tx error ->', err, receipt, txHash);

                        // if we have a txHash, then we will pick on the next run
                        if (!txHash) {
                            this.nonceTracker.releaseNonce(nonce, false, false);
                            this.updateTxData(
                                Object.assign(tx, {
                                    status: 'failed-send',
                                    reSend: true,
                                    reSendReceiver: true,
                                    reSendReceiverTxHash: false,
                                    reSendReceiverError: err,
                                }),
                            );
                        }
                    }),
            );
    }

    /**
     * if projectId is active, return projectId
     * otherwise returns first parentProject that is active
     * return undefined if no active project found
     *
     * @param {*} projectId
     * @returns Promise(projectId)
     */
    getParentProjectNotCanceled(projectId) {
        return this.lp
            .isProjectCanceled(projectId)
            .then(isCanceled => {
                if (!isCanceled) return projectId;
                return this.lp.getPledgeAdmin(projectId).then(admin => {
                    if (admin.parentProject)
                        return this.getParentProjectNotCanceled(admin.parentProject);

                    return undefined;
                });
            })
            .catch(e => {
                logger.debug('Failed to getParentProjectNotCanceled =>', projectId);
                return undefined;
            });
    }

    updateTxData(data) {
        const { _id } = data;
        this.db.txs.update({ _id }, data, {}, err => {
            if (err) {
                logger.error('Error updating bridge-txs.db ->', err, data);
                process.exit();
            }
        });
    }

    getFailedSendTxs() {
        return new Promise((resolve, reject) => {
            this.db.txs.find(
                {
                    status: 'failed-send',
                    $or: [{ reSend: { $exists: false } }, { reSend: false }],
                    $or: [{ notified: { $exists: false } }, { notified: false }],
                },
                (err, data) => {
                    if (err) {
                        logger.error('Error fetching failed-send txs from db ->', err);
                        resolve([]);
                        return;
                    }
                    resolve(data);
                },
            );
        });
    }

    getPendingTxs() {
        return new Promise((resolve, reject) => {
            // this.db.txs.find({ status: 'pending' }, (err, data) => err ? reject(err) : resolve(Array.isArray(data) ? data : [data]))
            this.db.txs.find({ status: 'pending' }, (err, data) => {
                if (err) {
                    logger.error('Error fetching pending txs from db ->', err);
                    resolve([]);
                    return;
                }
                resolve(data);
            });
        });
    }
}
