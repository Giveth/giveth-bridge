import Web3 from 'web3';
import logger from 'winston';
import uuidv4 from 'uuid/v4';
import { GivethBridge } from './GivethBridge';
import { ForeignGivethBridge } from './ForeignGivethBridge';

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

    this.homeBridge = new GivethBridge(homeWeb3, config.homeBridge);
    this.foreignBridge = new ForeignGivethBridge(foreignWeb3, config.foreignBridge);

    this.db = db;
    this.pollingPromise = undefined;
  }


  start() {
    this.loadBridgeData().then(bridgeData => {

      const intervalId = setInterval(() => {

        if (this.pollingPromise) {
          this.pollingPromise.finally(() => this.poll());
        } else {
          this.poll();
        }

      }, this.config.pollTime);
    });
  }

  sendForeignTx({ sender, mainToken, sideToken, amount, data, receiverId, giver, giverId }) {
    if (!sideToken) {
      this.updateTxData(
        new Tx(`None-${uuidv4()}`, false, {
          receiverId: receiverId,
          giver: giver,
          giverId: giverId,
          sender,
          mainToken,
          sideToken,
          amount,
          data,
          status: 'failed-send',
          error: 'No sideToken for mainToken'
        })
      );
      return;
    }

    let txHash;
    this.foreignBridge.bridge.deposit(
      sender,
      mainToken,
      amount,
      data
    )
      .on('transactionHash', transactionHash => {
        this.updateTxData(
          new Tx(transactionHash, false, {
            receiverId: receiverId,
            giver: giver,
            giverId: giverId,
            sender,
            mainToken,
            amount,
            data
          })
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
          this.updateTxData(
            new Tx(`None-${uuidv4()}`, false, {
              receiverId: receiverId,
              giver: giver,
              giverId: giverId,
              sender,
              mainToken,
              amount,
              data,
              status: 'failed-send',
              error: err
            })
          );
        }
      })
  }

  sendHomeTx({ recipeint, token, amount, txHash }) {
    let homeTxHash;
    this.homeBridge.bridge.authorizePayment(
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
            foreignTxHash: txHash,
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
              foreignTxHash: txHash,
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
    let homeFromBlock;
    let homeToBlock;
    let foreignFromBlock;
    let foreignToBlock;

    this.pollingPromise = Promise.all([
      homeWeb3.eth.getBlockNumber(),
      foreignWeb3.eth.getBlockNumber()
    ])
      .then(([homeBlock, foreignBlock]) => {

        homeFromBlock = bridgeData.homeBlockLastRelayed;
        homeToBlock = homeBlock - config.homeConfirmations;
        foreignFromBlock = bridgeData.foreignBlockLastRelayed;
        foreignToBlock = foreignBlock - config.foreignConfirmations;

        return Promise.all([
          homeBridge.getRelayTransactions(homeFromBlock, homeToBlock),
          foreignBridge.getRelayTransactions(foreignFromBlock, foreignToBlock),
        ])
      })
      .then(([toForeignTxs, toHomeTxs]) => {
        toForeignTxs.forEach(this.sendForeignTx);
        toHomeTxs.forEach(this.sendHomeTx);
      })
      .then(() => {
        bridgeData.homeBlockLastRelayed = homeToBlock;
        bridgeData.foreignBlockLastRelayed = foreignToBlock;
        this.updateBridgeData(bridgeData);
      })
      .catch(err => {
        logger.error('Error occured ->', err);
        bridgeData.homeBlockLastRelayed = homeFromBlock;
        bridgeData.foreignBlockLastRelayed = foreignFromBlock;
        this.updateBridgeData(bridgeData);
      })
      .finally(() => this.pollingPromise = undefined);
  }

  loadBridgeData() {
    const bridgeData = Object.assign({}, BridgeData);

    return new Promise((resolve, reject) => {
      this.db.bridge.findOne({}, (err, doc) => {
        if (err) {
          logger.error('Error loading bridge-config.db')
          process.exit();
        }

        if (!doc) {
          doc = {
            homeContractAddress: config.homeBridge,
            foreignContractAddress: config.foreignBridge,
            homeBlockLastRelayed: config.homeBridgeDeployBlock,
            foreignBlockLastRelayed: config.foreignBridgeDeployBlock
          };
          updateBridgeData(doc);
        }

        return Object.assign(bridgeData, doc);
      })
    });
  }

  updateTxData(data) {
    const { txHash } = data;
    this.db.txs.update({ txHash }, data, { upsert: true }, (err) => {
      if (err) {
        logger.error('Error updating bridge-txs.db ->', err, data);
        process.exit();
      }
    });
  }

  updateBridgeData(data) {
    this.db.bridge.update({ _id: data._id }, data, { upsert: true }, (err) => {
      if (err) logger.error('Error updating bridge-config.db ->', err, data);
    });
  }
}
