import logger from 'winston';
import { LiquidPledging } from 'giveth-liquidpledging';
import getGasPrice from './gasPrice';
import { sendEmail } from './utils';
import ForeignGivethBridge from './ForeignGivethBridge';

export default class Verifier {
  constructor(homeWeb3, foreignWeb3, config, db) {
    this.homeWeb3 = homeWeb3;
    this.foreignWeb3 = foreignWeb3;
    this.db = db;
    this.config = config;
    this.lp = new LiquidPledging(foreignWeb3, config.liquidPledging);
    this.foreignBridge = new ForeignGivethBridge(foreignWeb3, config.foreignBridge);
    this.currentHomeBlockNumber = undefined;
    this.currentForeignBlockNumber = undefined;
    this.account = homeWeb3.eth.accounts.wallet[0];
  }

  start() {
    const intervalId = setInterval(() => this.verify(), this.config.pollTime);
    this.verify();
  }

  verify() {
    return Promise.all([
      this.homeWeb3.eth.getBlockNumber(),
      this.foreignWeb3.eth.getBlockNumber()
    ])
      .then(([homeBlockNumber, foreignBlockNumber]) => {
        this.currentHomeBlockNumber = homeBlockNumber;
        this.currentForeignBlockNumber = foreignBlockNumber;

        return Promise.all([this.getFailedSendTxs(), this.getPendingTxs()])
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
    const web3 = (tx.toHomeBridge) ? this.homeWeb3 : this.foreignWeb3;
    const currentBlock = (tx.toHomeBridge) ? this.currentHomeBlockNumber : this.currentForeignBlockNumber;
    const confirmations = (tx.toHomeBridge) ? this.config.homeConfirmations : this.foreignConfirmations;

    // order matters here
    const txHash = tx.reSendTxHash || tx.reSendCreateGiverTxHash || tx.txHash;

    if (tx.status === 'pending') {
      return web3.eth.getTransactionReceipt(txHash)
        .then(receipt => {
          if (!receipt) return; // not mined

          // only update if we have enough confirmations
          if (currentBlock - receipt.blockNumber <= confirmations) return;

          if (receipt.status === true || receipt.status === '0x01' || receipt.status === '0x1' || receipt.status === 1) {
            // this was a createGiver tx, we still need to transfer the funds to the giver
            if (txHash === tx.reSendCreateGiverTxHash) {
              // GiverAdded event topic
              const { topics } = receipt.logs.find(l => l.topics[0] === '0xad9c62a4382fd0ddbc4a0cf6c2bc7df75b0b8beb786ff59014f39daaea7f232f');
              tx.giverId = this.homeWeb3.utils.hexToNumber(topics[1]); // idGiver is 1st indexed param, thus 2nd topic
              return this.sendToGiver(tx);
            }
            this.updateTxData(Object.assign(tx, {
              status: 'confirmed'
            }));
            return;
          }

          return this.handleFailedTx(tx);
        })
        .catch(err => {
          logger.error('Failed to fetch tx receipt for tx', tx, err);
        })
    } else if (tx.status === 'failed-send') {
      return this.handleFailedTx(tx);
    } else {
      sendEmail(`Unknown tx status \n\n ${JSON.stringify(tx, null, 2)}`);
      logger.error('Unknown tx status ->', tx);
    }
  }

  handleFailedTx(tx) {
    const web3 = (tx.toHomeBridge) ? this.homeWeb3 : this.foreignWeb3;

    if (tx.toHomeBridge) {
      // this shouldn't fail, send email as we need to investigate
      sendEmail(`AuthorizePayment tx failed toHomeBridge \n\n ${JSON.stringify(tx, null, 2)}`);
      logger.error('AuthorizePayment tx failed toHomeBridge ->', tx);
    } else {
      return this.lp.getPledgeAdmin(tx.receiverId)
        .catch(e => {
          // receiver may not exist, catch error and pass undefined
          logger.debug('Failed to fetch pledgeAdmin for tx.receiverId ->', tx);
          return;
        })
        .then(admin => {
          if (!admin || admin.adminType === '0') { // giver
            return this.sendToGiver(tx);
          } else if (admin.adminType === '1') { // delegate
            return this.sendToGiver(tx);
          } else if (admin.adminType === '2') { // project
            // check if there is a parentProject we can send to if project is canceled 
            return this.getParentProjectNotCanceled(tx.receiverId)
              .then(projectId => {
                if (!projectId || projectId === tx.receiverId || projectId == 0) return this.sendToGiver(tx);

                return this.sendToParentProject(tx, projectId);
              });
          } else {
            // shouldn't get here
            sendEmail(`Unknown receiver adminType \n\n ${JSON.stringify(tx, null, 2)}`);
            logger.error('Unknown receiver adminType ->', tx);
          }
        });
    }
  }

  sendToGiver(tx) {
    // already attempted to send to giver, notify of failure 
    if (tx.reSendGiver) {
      this.updateTxData(Object.assign(tx, { status: 'failed' }))
      sendEmail(`ForeignBridge sendToGiver  Tx failed. NEED TO TAKE ACTION \n\n${JSON.stringify(tx, null, 2)}`);
      logger.error("ForeignBridge sendToGiver Tx failed. NEED TO TAKE ACTION ->", tx);
      return;
    }

    if (!tx.giver && !tx.giverId) {
      sendEmail(`Tx missing giver and giverId. Can't sendToGiver \n\n ${JSON.stringify(tx, null, 2)}`);
      logger.error('Tx missing giver and giverId. Cant sendToGiver ->', tx);
      return;
    }

    if (tx.giver && !tx.giverId) return this.createGiver(tx);

    const data = this.lp.$contract.methods.donate(tx.giverId, tx.giverId, tx.sideToken, tx.amount).encodeABI();

    let txHash;
    return getGasPrice(false)
      .then(gasPrice =>
        this.foreignBridge.bridge.deposit(
          tx.sender,
          tx.mainToken,
          tx.amount,
          tx.homeTx,
          data,
          { from: this.account.address, gasPrice }
        )
          .on('transactionHash', transactionHash => {
            this.updateTxData(Object.assign(tx, {
              status: 'pending',
              reSend: true,
              reSendGiver: true,
              reSendTxHash: transactionHash,
            }));
            txHash = transactionHash;
          })
          // TODO does this catch txs that sent, but failed? we want to ignore those as we will pick them up later
          .catch((err, receipt) => {
            logger.debug('ForeignBridge resend tx error ->', err, receipt, txHash);

            if (txHash) {
              logger.error('failed w/ txHash', err, receipt, txHash);
              sendEmail(`sendToGiver tx failed to send to ForeignBridge \n\n ${txHash}`);
            } else {
              this.updateTxData(Object.assign(tx, { status: 'failed-send', reSend: true, reSendError: err, reSendTxHash: false, reSendGiver: true }));
            }
          })
      );
  }

  createGiver(tx) {
    if (tx.reSendCreateGiver) {
      this.updateTxData(Object.assign(tx, { status: 'failed' }))
      sendEmail(`ForeignBridge createGiver Tx failed. NEED TO TAKE ACTION \n\n${JSON.stringify(tx, null, 2)}`);
      logger.error("ForeignBridge createGiver Tx failed. NEED TO TAKE ACTION ->", tx);
      return;
    }

    let txHash;
    return getGasPrice(false)
      .then(gasPrice =>
        this.lp.addGiver(
          tx.giver,
          '',
          '',
          259200,
          0,
          { from: this.account.address, gasPrice }
        )
          .on('transactionHash', transactionHash => {
            this.updateTxData(Object.assign(tx, {
              status: 'pending',
              reSend: true,
              reSendCreateGiver: true,
              reSendCreateGiverTxHash: transactionHash,
            }));
            txHash = transactionHash;
          })
          // TODO does this catch txs that sent, but failed? we want to ignore those as we will pick them up later
          .catch((err, receipt) => {
            logger.debug('ForeignBridge resend createGiver tx error ->', err, receipt, txHash);

            if (txHash) {
              logger.error('failed w/ txHash', err, receipt, txHash);
              sendEmail(`createGiver failed to send to ForeignBridge \n\n ${txHash}`);
            } else {
              this.updateTxData(Object.assign(tx, { status: 'failed-send', reSend: true, reSendError: err, reSendCreateGiverTxHash: false, reSendCreateGiver: true }));
            }
          })
      )

  }

  sendToParentProject(tx, parentProjectId) {
    tx.receiverId = parentProjectId;

    if (!tx.giver && !tx.giverId) {
      sendEmail(`Tx missing giver and giverId. Can't sendToParentProject\n\n ${JSON.stringify(tx, null, 2)}`);
      logger.error('Tx missing giver and giverId. Cant sendToParentProject ->', tx);
      return;
    }

    let data;
    if (tx.giver) {
      data = this.lp.$contract.methods.addGiverAndDonate(tx.receiverId, tx.giver, tx.sideToken, tx.amount).encodeABI();
    } else {
      data = this.lp.$contract.methods.donate(tx.giverId, tx.receiverId, tx.sideToken, tx.amount).encodeABI();
    }

    let txHash;
    return getGasPrice().then(gasPrice =>
      this.foreignBridge.bridge.deposit(
        tx.sender,
        tx.mainToken,
        tx.amount,
        tx.homeTx,
        data,
        { from: this.account.address, gasPrice }
      )
        .on('transactionHash', transactionHash => {
          this.updateTxData(Object.assign(tx, {
            status: 'pending',
            reSend: true,
            reSendTxHash: transactionHash,
          }));
          txHash = transactionHash;
        })
        // TODO does this catch txs that sent, but failed? we want to ignore those as we will pick them up later
        .catch((err, receipt) => {
          logger.debug('ForeignBridge resend tx error ->', err, receipt, txHash);

          if (txHash) {
            logger.error('failed w/ txHash', err, receipt, txHash);
            sendEmail(`sendToParentProject tx failed to send to ForeignBridge \n\n ${txHash}`);
          } else {
            this.updateTxData(Object.assign(tx, { status: 'failed-send', reSend: true, reSendError: err, reSendTxHash: false }));
          }
        })
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
    return this.lp.isProjectCanceled(projectId)
      .then(isCanceled => {
        if (!isCanceled) return projectId;
        return this.lp.getPledgeAdmin(projectId)
          .then(admin => {
            if (admin.parentProject) return this.getParentProjectNotCanceled(admin.parentProject);

            return undefined;
          })
      })
      .catch(e => {
        logger.debug('Failed to getParentProjectNotCanceled =>', projectId);
        return undefined;
      })
  }

  updateTxData(data) {
    const { txHash } = data;
    this.db.txs.update({ txHash }, data, {}, (err) => {
      if (err) {
        logger.error('Error updating bridge-txs.db ->', err, data);
        process.exit();
      }
    });
  }

  getFailedSendTxs() {
    return new Promise((resolve, reject) => {
      this.db.txs.find({
        status: 'failed-send',
        $or: [
          { reSend: { $exists: false } },
          { reSend: false }
        ],
        $or: [
          { notified: { $exists: false } },
          { notified: false }
        ]
      }, (err, data) => {
        if (err) {
          logger.error('Error fetching failed-send txs from db ->', err);
          resolve([]);
          return;
        }
        resolve(data)
      })
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
        resolve(data)
      });
    });
  }
}
