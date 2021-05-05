/* eslint-disable consistent-return */
import logger from 'winston';
import getGasPrice from './gasPrice';
import { sendEmail } from './utils';
import CSTokenMinter from './CSTokenMinter';
import checkBalance from './checkBalance';

export default class Verifier {
    constructor(homeWeb3, foreignWeb3, nonceTracker, config, db) {
        this.homeWeb3 = homeWeb3;
        this.foreignWeb3 = foreignWeb3;
        this.nonceTracker = nonceTracker;
        this.db = db;
        this.config = config;
        this.foreignBridge = new CSTokenMinter(foreignWeb3, config.minter);
        this.currentForeignBlockNumber = undefined;
        // eslint-disable-next-line prefer-destructuring
        this.account = homeWeb3.eth.accounts.wallet[0];
    }

    /* istanbul ignore next */
    start() {
        setInterval(() => this.verify(), this.config.pollTime);
        this.verify();
        checkBalance(this.config, this.homeWeb3);
    }

    verify() {
        return Promise.all([
            this.foreignWeb3.eth.getBlockNumber(),
        ])
            .then(([foreignBlockNumber]) => {
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
        const web3 = this.foreignWeb3;
        const currentBlock =  this.currentForeignBlockNumber;
        const confirmations = this.foreignConfirmations;

        // order matters here
        const { txHash } = tx;

        if (tx.status === 'pending') {
            return web3.eth
                .getTransactionReceipt(txHash)
                .then(receipt => {
                    if (!receipt) return; // not mined

                    // only update if we have enough confirmations
                    if (currentBlock - receipt.blockNumber <= confirmations) return;

                    checkBalance(this.config, this.homeWeb3);

                    if (
                        receipt.status === true ||
                        receipt.status === '0x01' ||
                        receipt.status === '0x1' ||
                        Number(receipt.status) === 1
                    ) {
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
                        sendEmail(
                            this.config,
                            `Failed to fetch tx receipt for tx \n\n ${JSON.stringify(tx, null, 2)}`,
                        );
                        logger.error('Failed to fetch tx receipt for tx', tx, err);
                    }
                });
        }
        if (tx.status === 'failed-send') {
            return this.handleFailedTx(tx);
        }
        sendEmail(this.config, `Unknown tx status \n\n ${JSON.stringify(tx, null, 2)}`);
        logger.error('Unknown tx status ->', tx);
    }

    handleFailedTx(tx) {
        const handleFailedReceiver = () =>
        {
            logger.debug('handling failed receiver ->', tx.receiverId, tx);
            return this.sendTo(tx);
        };

            // check that the giver is valid
            // if we don't have a giverId, we don't need to fetch the admin b/c this was a
            // donateAndCreateGiver call and we need to handle the failed receiver
        handleFailedReceiver();
    }

    sendTo(tx) {
        logger.debug('send to cs token contract');
        // already attempted to send to giver, notify of failure
        if (tx.reSend) {
            this.updateTxData(Object.assign(tx, { status: 'failed' }));
            sendEmail(
                this.config,
                `Minter deposit Tx failed. NEED TO TAKE ACTION \n\n${JSON.stringify(
                    tx,
                    null,
                    2,
                )}`,
            );
            logger.error('Minter deposit Tx failed. NEED TO TAKE ACTION ->', tx);
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
            .then(gasPrice => {
                const { amount, token, homeTx, receiverId, sender } = tx;
                return this.foreignBridge.minter
                    .deposit(sender, token, receiverId, amount, homeTx, {
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
                            }),
                        );
                        txHash = transactionHash;
                    })
                    .catch((err, receipt) => {
                        logger.debug('Minter resend tx error ->', err, receipt, txHash);

                        // if we have a txHash, then we will pick on the next run
                        if (!txHash) {
                            this.nonceTracker.releaseNonce(nonce, false, false);
                            this.updateTxData(
                                Object.assign(tx, {
                                    status: 'failed-send',
                                    reSend: true,
                                    reSendError: err,
                                }),
                            );
                        }
                    });
            },
            );
    }

    updateTxData(data) {
        const { _id } = data;
        this.db.txs.update({ _id }, data, {}, err => {
            if (err) {
                logger.error('Error updating minter-txs.db ->', err, data);
                process.exit();
            }
        });
    }

    getFailedSendTxs() {
        return new Promise((resolve, _) => {
            this.db.txs.find(
                {
                    status: 'failed-send',
                    $and: [
                        {
                            $or: [{ reSend: { $exists: false } }, { reSend: false }],
                        },
                        {
                            $or: [{ notified: { $exists: false } }, { notified: false }],
                        }
                    ]
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
        return new Promise((resolve, _) => {
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
