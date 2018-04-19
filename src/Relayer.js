import Web3 from 'web3';
import logger from 'winston';
import uuidv4 from 'uuid/v4';
import GivethBridge from './GivethBridge';
import ForeignGivethBridge from './ForeignGivethBridge';

const BridgeData = {
  homeContractAddress: '',
  foreignContractAddress: '',
  homeBlockLastRelayed: 0,
  foreignBlockLastRelayed: 0
}

export class Tx {
  constructor(txHash, toHomeBridge, data = {}) {
    this.txHash = txHash;
    this.toHomeBridge = toHomeBridge;
    // pending - tx submitted
    // confirmed - tx confirmend and correct number of blocks have passed for the network (config values)
    // failed - tx submitted and failed and correct number of blocks have passed for the network (config values)
    // failed-send - tx failed on send
    this.status = "pending"
    Object.assign(this, data);
  }
}



export default class Relayer {
  constructor(config, db) {
    this.homeWeb3 = new Web3(config.homeNodeUrl);
    this.foreignWeb3 = new Web3(config.foreignNodeUrl);

    this.account = this.homeWeb3.eth.accounts.privateKeyToAccount(config.pk);
    this.homeWeb3.eth.accounts.wallet.add(this.account);
    this.foreignWeb3.eth.accounts.wallet.add(this.account);

    this.homeBridge = new GivethBridge(this.homeWeb3, this.foreignWeb3, config.homeBridge, config.foreignBridge);
    this.foreignBridge = new ForeignGivethBridge(this.foreignWeb3, config.foreignBridge);

    this.db = db;
    this.config = config;
    this.pollingPromise;
    this.bridgeData;
  }


  start() {
    this.loadBridgeData().then(() => {

      const intervalId = setInterval(() => {

        if (this.pollingPromise) {
          this.pollingPromise.finally(() => this.poll());
        } else {
          this.poll();
        }

      }, this.config.pollTime);
    });
  }

  sendForeignTx(data) {
    const { sender, mainToken, amount, data, homeTx } = data;

    if (!sideToken) {
      data.status = 'failed-send';
      data.error = 'No sideToken for mainToken';
      this.updateTxData(
        new Tx(`None-${uuidv4()}`, false, data)
      );
      return Promise.resolve();
    }

    let txHash;
    return this.foreignBridge.bridge.deposit(
      sender,
      mainToken,
      amount,
      data,
      homeTx,
      { from: this.account.address }
    )
      .on('transactionHash', transactionHash => {
        this.updateTxData(
          new Tx(transactionHash, false, data)
        );
        txHash = transactionHash;
      })
      // TODO does this catch txs that sent, but failed? we want to ignore those as we will pick them up later
      .catch((err, receipt) => {
        logger.debug('ForeignBridge tx error ->', err, receipt);

        if (txHash) {
          logger.error('failed w/ txHash', err, receipt);
          // this.updateTxData({ txHash, status: 'failed', error: err });
        } else {
          data.error = err;
          data.status = 'failed-send';
          this.updateTxData(
            new Tx(`None-${uuidv4()}`, false, data)
          );
        }
      })
  }

  sendHomeTx({ recipeint, token, amount, txHash }) {
    let homeTxHash;
    return this.homeBridge.bridge.authorizePayment(
      '',
      txHash,
      recipient,
      token,
      amount,
      0
    )
      .on('transactionHash', transactionHash => {
        this.updateTxData(
          new Tx(transactionHash, true, {
            foreignTx: txHash,
            recipient,
            token,
            amount
          })
        );
        homeTxHash = transactionHash;
      })
      .catch((err, receipt) => {
        logger.debug('HomeBridge tx error ->', err, receipt);

        if (homeTxHash) {
          logger.error('failed w/ txHash', err, receipt);
          // this.updateTxData({ txhash: homeTxHash, status: 'failed', error: err });
        } else {
          this.updateTxData(
            new Tx(`None-${uuidv4()}`, true, {
              foreignTx: txHash,
              recipient,
              token,
              amount,
              status: 'failed-send',
              error: err
            })
          );
        }
      });
  }

  poll() {
    if (!this.bridgeData) return this.loadBridgeData().then(() => this.poll());

    let homeFromBlock;
    let homeToBlock;
    let foreignFromBlock;
    let foreignToBlock;

    this.pollingPromise = Promise.all([
      this.homeWeb3.eth.getBlockNumber(),
      this.foreignWeb3.eth.getBlockNumber()
    ])
      .then(([homeBlock, foreignBlock]) => {

        homeFromBlock = this.bridgeData.homeBlockLastRelayed;
        homeToBlock = homeBlock - this.config.homeConfirmations;
        foreignFromBlock = this.bridgeData.foreignBlockLastRelayed;
        foreignToBlock = foreignBlock - this.config.foreignConfirmations;

        return Promise.all([
          this.homeBridge.getRelayTransactions(homeFromBlock, homeToBlock),
          this.foreignBridge.getRelayTransactions(foreignFromBlock, foreignToBlock),
        ])
      })
      .then(([toForeignTxs = [], toHomeTxs = []]) => {
        const foreignPromises = toForeignTxs.map(t => this.sendForeignTx(t));
        const homePromises = toHomeTxs.map(t => this.sendHomeTx(t));

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
      })
      .finally(() => this.pollingPromise = undefined);

    return this.pollingPromise;
  }

  loadBridgeData() {
    const bridgeData = Object.assign({}, BridgeData);

    return new Promise((resolve, reject) => {
      this.db.bridge.findOne({}, (err, doc) => {
        if (err) {
          logger.error('Error loading bridge-config.db')
          reject(err);
          process.exit();
        }

        if (!doc) {
          doc = {
            homeContractAddress: this.config.homeBridge,
            foreignContractAddress: this.config.foreignBridge,
            homeBlockLastRelayed: this.config.homeBridgeDeployBlock,
            foreignBlockLastRelayed: this.config.foreignBridgeDeployBlock
          };
          this.updateBridgeData(doc);
        }

        this.bridgeData = Object.assign(bridgeData, doc);
        resolve(this.bridgeData);
      })
    });
  }

  updateTxData(data) {
    const { txHash } = data;
    this.db.txs.update({ txHash }, data, { upsert: true }, (err) => {
      if (err) {
        logger.error('Error updating bridge-txs.db ->', err, data);
        // process.exit();
      }
    });
  }

  updateBridgeData(data) {
    this.db.bridge.update({ _id: data._id }, data, { upsert: true }, (err) => {
      if (err) logger.error('Error updating bridge-config.db ->', err, data);
    });
  }
}
