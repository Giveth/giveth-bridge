import Web3 from 'web3';
import logger from 'winston';
import uuidv4 from 'uuid/v4';
import GivethBridge from './GivethBridge';
import ForeignGivethBridge from './ForeignGivethBridge';
import getGasPrice from './gasPrice';
import { sendEmail } from './utils';

const BridgeData = {
    homeContractAddress: '',
    foreignContractAddress: '',
    homeBlockLastRelayed: 0,
    foreignBlockLastRelayed: 0,
};

export class Tx {
    constructor(txHash, toHomeBridge, data = {}) {
        this.txHash = txHash;
        this.toHomeBridge = toHomeBridge;
        // to-send - received event, need to submit tx
        // pending - tx submitted
        // confirmed - tx confirmend and correct number of blocks have passed for the network (config values)
        // failed - tx submitted and failed and correct number of blocks have passed for the network (config values)
        // failed-send - tx failed on send
        this.status = 'to-send';
        Object.assign(this, data);
    }
}

export default class Relayer {
    constructor(homeWeb3, foreignWeb3, nonceTracker, config, db) {
        this.homeWeb3 = homeWeb3;
        this.foreignWeb3 = foreignWeb3;
        this.account = homeWeb3.eth.accounts.wallet[0];
        this.nonceTracker = nonceTracker;

        this.homeBridge = new GivethBridge(
            this.homeWeb3,
            this.foreignWeb3,
            config.homeBridge,
            config.foreignBridge,
        );
        this.foreignBridge = new ForeignGivethBridge(this.foreignWeb3, config.foreignBridge);

        this.db = db;
        this.config = config;
        this.pollingPromise;
        this.bridgeData;
    }

    /* istanbul ignore next */
    start() {
        this.loadBridgeData().then(() => {
            // It is possible to have created txs, but not yet relayed
            // them, if the server was restarted in the middle of a relay
            // so do it now
            this.relayUnsentTxs();

            const intervalId = setInterval(() => {
                if (this.pollingPromise) {
                    logger.debug('Already polling, running after previous round finishes');
                    this.pollingPromise.finally(() => {
                        logger.debug('polling round finished. starting next');
                        this.poll();
                    });
                } else {
                    this.poll();
                }
            }, this.config.pollTime);

            this.poll();
        });
    }

    sendForeignTx(tx, gasPrice) {
        const { sender, mainToken, amount, data, homeTx } = tx;

        if (!tx.sideToken) {
            this.updateTxData(
                Object.assign({}, tx, {
                    status: 'failed-send',
                    error: 'No sideToken for mainToken',
                }),
            );
            return Promise.resolve();
        }

        let nonce;
        let txHash;
        return this.nonceTracker
            .obtainNonce()
            .then(n => {
                nonce = n;
                return this.foreignBridge.bridge
                    .deposit(sender, mainToken, amount, homeTx, data, {
                        from: this.account.address,
                        nonce,
                        gasPrice,
                        $extraGas: 100000,
                    })
                    .on('transactionHash', transactionHash => {
                        txHash = transactionHash;
                        this.nonceTracker.releaseNonce(nonce);
                        this.updateTxData(Object.assign({}, tx, { txHash, status: 'pending' }));
                    });
            })
            .catch((error, receipt) => {
                logger.debug('ForeignBridge tx error ->', error, receipt, txHash);

                // if we have a txHash, then we will pick up the failure in the Verifyer
                if (!txHash) {
                    this.nonceTracker.releaseNonce(nonce, false, false);
                    this.updateTxData(
                        Object.assign({}, tx, {
                            error,
                            status: 'failed-send',
                        }),
                    );
                }
            });
    }

    sendHomeTx(tx, gasPrice) {
        const { recipient, token, amount, foreignTx } = tx;
        let nonce;
        let txHash;
        return this.nonceTracker
            .obtainNonce(true)
            .then(n => {
                nonce = n;
                return this.homeBridge.bridge
                    .authorizePayment('', foreignTx, recipient, token, amount, 0, {
                        from: this.account.address,
                        nonce,
                        gasPrice,
                        $extraGas: 100000,
                    })
                    .on('transactionHash', transactionHash => {
                        txHash = transactionHash;
                        this.nonceTracker.releaseNonce(nonce, true, true);
                        this.updateTxData(
                            Object.assign(tx, {
                                txHash,
                                status: 'pending',
                            }),
                        );
                    });
            })
            .catch((error, receipt) => {
                logger.debug('HomeBridge tx error ->', error, receipt, txHash);

                // if we have a homeTxHash, then we will pick up the failure in the Verifyer
                if (!txHash) {
                    this.nonceTracker.releaseNonce(nonce, true, false);
                    this.updateTxData(
                        Object.assign({}, tx, {
                            status: 'failed-send',
                            error,
                        }),
                    );
                }
            });
    }

    poll() {
        if (!this.bridgeData) return this.loadBridgeData().then(() => this.poll());

        let homeFromBlock;
        let homeToBlock;
        let homeGasPrice;
        let foreignFromBlock;
        let foreignToBlock;
        let foreignGasPrice;

        this.pollingPromise = Promise.all([
            this.homeWeb3.eth.getBlockNumber(),
            this.foreignWeb3.eth.getBlockNumber(),
            getGasPrice(this.config, true),
            getGasPrice(this.config, false),
        ])
            .then(([homeBlock, foreignBlock, homeGP, foreignGP]) => {
                logger.debug('Fetched homeBlock:', homeBlock, 'foreignBlock:', foreignBlock);

                const { homeBlockLastRelayed, foreignBlockLastRelayed } = this.bridgeData;
                homeGasPrice = homeGP;
                foreignGasPrice = foreignGP;

                homeFromBlock = homeBlockLastRelayed ? homeBlockLastRelayed + 1 : 0;
                homeToBlock = homeBlock - this.config.homeConfirmations;
                foreignFromBlock = foreignBlockLastRelayed ? foreignBlockLastRelayed + 1 : 0;
                foreignToBlock = foreignBlock - this.config.foreignConfirmations;

                return Promise.all([
                    this.homeBridge.getRelayTransactions(homeFromBlock, homeToBlock),
                    this.foreignBridge.getRelayTransactions(foreignFromBlock, foreignToBlock),
                ])
                    .then(async ([toForeignTxs = [], toHomeTxs = []]) => {
                        // now that we have the txs to relay, we persist the tx if it is not a duplicate
                        // and relay the tx.

                        // we await for insertTxDataIfNew so we can syncrounously check for duplicate txs
                        const insertedForeignTxs = await Promise.all(
                            toForeignTxs.map(t => this.insertTxDataIfNew(t, false)),
                        );
                        const foreignPromises = insertedForeignTxs
                            .filter(tx => tx !== undefined)
                            .map(tx => this.sendForeignTx(tx, foreignGasPrice));

                        const insertedHomeTxs = await Promise.all(
                            toHomeTxs.map(t => this.insertTxDataIfNew(t, true)),
                        );
                        const homePromises = insertedHomeTxs
                            .filter(tx => tx !== undefined)
                            .map(tx => this.sendHomeTx(tx, homeGasPrice));

                        if (this.config.isTest) {
                            return Promise.all([...foreignPromises, ...homePromises]);
                        }
                    })
                    .then(() => {
                        this.bridgeData.homeBlockLastRelayed = homeToBlock;
                        this.bridgeData.foreignBlockLastRelayed = foreignToBlock;
                        this.updateBridgeData(this.bridgeData);
                    })
                    .catch(err => {
                        logger.error('Error occured ->', err);
                        this.bridgeData.homeBlockLastRelayed = homeFromBlock;
                        this.bridgeData.foreignBlockLastRelayed = foreignFromBlock;
                        this.updateBridgeData(this.bridgeData);
                    });
            })
            .catch(err => {
                // catch error fetching block or gasPrice
                logger.error('Error occured fetching blockNumbers or gasPrice ->', err);
            })
            .finally(() => (this.pollingPromise = undefined));

        return this.pollingPromise;
    }

    loadBridgeData() {
        const bridgeData = Object.assign({}, BridgeData);

        return new Promise((resolve, reject) => {
            this.db.bridge.findOne({}, (err, doc) => {
                if (err) {
                    logger.error('Error loading bridge-config.db');
                    reject(err);
                    process.exit();
                }

                if (!doc) {
                    doc = {
                        homeContractAddress: this.config.homeBridge,
                        foreignContractAddress: this.config.foreignBridge,
                        homeBlockLastRelayed: this.config.homeBridgeDeployBlock,
                        foreignBlockLastRelayed: this.config.foreignBridgeDeployBlock,
                    };
                    this.updateBridgeData(doc);
                }

                this.bridgeData = Object.assign(bridgeData, doc);
                resolve(this.bridgeData);
            });
        });
    }

    relayUnsentTxs() {
        return Promise.all([getGasPrice(this.config, true), getGasPrice(this.config, false)])
            .then(
                ([homeGP, foreignGP]) =>
                    new Promise(resolve => {
                        this.db.txs.find({ status: 'to-send' }, (err, docs) => {
                            if (err) {
                                logger.error('Error loading to-send txs');
                                resolve();
                            }

                            const promises = docs.map(
                                tx =>
                                    tx.toHomeBridge
                                        ? this.sendHomeTx(tx, homeGP)
                                        : this.sendForeignTx(tx, foreignGP),
                            );
                            Promise.all([...promises]).then(() => resolve());
                        });
                    }),
            )
            .catch(err => {
                logger.error('Error sending unsent txs', err);
                sendEmail(
                    this.config,
                    `Error sending unsent txs \n\n${JSON.stringify(err, null, 2)}`,
                );
            });
    }

    /**
     * Checks that this is a new tx. If new, we persist the tx and return the persisted object
     * with a generated _id. If this is a duplicate, we will send an error email for further
     * investigation and return undefined
     *
     * @param {*} data
     * @param {*} toHomeBridge
     */
    insertTxDataIfNew(data, toHomeBridge) {
        const tx = new Tx(undefined, toHomeBridge, data);

        const query = toHomeBridge ? { foreignTx: tx.foreignTx } : { homeTx: tx.homeTx };

        return new Promise((resolve, reject) => {
            this.db.txs.find(query, (err, docs) => {
                if (err || docs.length > 0) {
                    sendEmail(
                        this.config,
                        `Ignoring duplicate tx. NEED TO INVESTIGATE\n\n ${JSON.stringify(
                            tx,
                            null,
                            2,
                        )}\n\n${JSON.stringify(err, null, 2)}`,
                    );
                    logger.error('Ignoring duplicate tx ->', err, tx);
                    resolve();
                    return;
                }

                this.db.txs.insert(tx, (err, doc) => {
                    if (err) {
                        logger.error('Error inserting bridge-txs.db ->', err, data);
                        reject(error);
                    }
                    resolve(doc);
                });
            });
        });
    }

    updateTxData(data) {
        const { _id } = data;
        if (!_id) throw new Error('Attempting to update txData without an _id');
        this.db.txs.update({ _id }, data, {}, err => {
            if (err) {
                logger.error('Error updating bridge-txs.db ->', err, data);
            }
        });
    }

    updateBridgeData(data) {
        this.db.bridge.update({ _id: data._id }, data, { upsert: true }, err => {
            if (err) logger.error('Error updating bridge-config.db ->', err, data);
        });
    }
}
