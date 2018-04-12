import logger from 'winston';
import { LiquidPledging } from 'giveth-liquidpledging';
import { sendEmail } from './utils';

export class Verifier {
  constructor(homeWeb3, foreignWeb3, config, db) {
    this.homeWeb3 = homeWeb3;
    this.foreignWeb3 = foreignWeb3;
    this.db = db;
    this.config = config;
    this.lp = new LiquidPledging(web3, config.liquidPledging);
    this.currentHomeBlockNumber = undefined;
    this.currentForeignBlockNumber = undefined;
  }

  start() {
    const intervalId = setInterval(() => {
      Promise.all([
        this.homeWeb3.getBlockNumber(),
        this.foreignWeb3.getBlockNumber()
      ])
        .then(([homeBlockNumber, foreignBlockNumber]) => {
          this.currentHomeBlockNumber = homeBlockNumber;
          this.currentForeignBlockNumber = foreignBlockNumber;

          this.getFailedSendTxs()
            .then(txs => {
              txs.forEach(tx => this.verifyTx(tx));
            })
            .catch(err => console.error('Error fetching failed-send txs from db ->', err));

          this.getPendingTxs()
            .then(txs => {
              txs.forEach(tx => this.verifyTx(tx));
            })
            .catch(err => console.error('Error fetching pending txs from db ->', err));
        })
        .catch(err => console.error('Failed to fetch block number ->', err));

    }, config.pollTime);
  }

  verifyTx(tx) {
    const web3 = (tx.toHomeBridge) ? this.homeWeb3 : this.foreignWeb3;
    const currentBlock = (tx.toHomeBridge) ? this.currentHomeBlockNumber : this.currentForeignBlockNumber;
    const confirmations = (tx.toHomeBridge) ? this.config.homeConfirmations : this.foreignConfirmations;

    if (tx.status === 'pending') {
      web3.eth.getTransactionReceipt(tx.txHash)
        .then(receipt => {
          if (!receipt) return; // not mined

          // only update if we have enough confirmations
          if (currentBlock - receipt.blockNumber <= confirmations) return;

          if (receipt.status === 1) {
            this.updateTxData(Object.assign(tx, {
              status: 'confirmed'
            }));
            return;
          }

          this.handleFailedTx(tx, receipt);

        })
        .catch(err => {
          logger.error('Failed to fetch tx receipt for tx', tx);
        })
    } else if (tx.status === 'failed-send') {
      // this shouldn't fail, send email as we need to investigate
      tx.notified = true;
      this.updateTxData(tx);
      sendEmail(`Tx failed to send \n\n ${JSON.stringify(tx, null, 2)}`);
      logger.error('Tx failed to send ->', tx);
    } else {
      sendEmail(`Unknown tx status \n\n ${JSON.stringify(tx, null, 2)}`);
      logger.error('Unknown tx status ->', tx);
    }
  }

  handleFailedTx(tx, receipt) {
    const web3 = (tx.toHomeBridge) ? this.homeWeb3 : this.foreignWeb3;

    if (tx.toHomeBridge) {
      // this shouldn't fail, send email as we need to investigate
      sendEmail(`AuthorizePayment tx failed toHomeBridge \n\n ${JSON.stringify(tx, null, 2)}`);
      logger.error('AuthorizePayment tx failed toHomeBridge ->', tx);
    } else {
      this.lp.getPledgeAdmin(tx.receiverId)
        .then(admin => {
          if (admin.adminType === '0') { // giver
            return this.sendToGiver(tx);
          } else if (admin.adminType === '1') { // delegate
            return this.sendToGiver(tx);
          } else if (admin.adminType === '2') { // project
            // check if there is a parentProject we can send to if project is canceled 
            this.getParentProjectNotCanceled(tx.rec)
              .then(projectId => {
                if (!projectId || projectId === tx.receiverId) return this.sendToGiver(tx);

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
      sendEmail("ForeignBridge Tx failed. NEED TO TAKE ACTION \n\n", tx);
      logger.error("ForeignBridge Tx failed. NEED TO TAKE ACTION ->", tx);
      return;
    }

    const data = this.getResendData(tx);
    if (!data) return;

    let txHash;
    this.foreignBridge.bridge.deposit(
      tx.sender,
      tx.mainToken,
      tx.amount,
      data
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
        logger.debug('ForeignBridge resend tx error ->', err, receipt);

        if (txHash) {
          logger.error('failed w/ txHash', err, receipt);
          // this.updateTxData(Object.assign(tx, { status: 'failed', reSendError: err, reSendTxHash: txHash }));
        } else {
          this.updateTxData(Object.assign(tx, { status: 'failed-send', reSend: true, reSendError: err, reSendTxHash: false, reSendGiver: true }));
        }
      });
  }

  sendToParentProject(tx, parentProjectId) {
    tx.receiverId = parentProjectId;

    const data = this.getResendData(tx);
    if (!data) return;

    let txHash;
    this.foreignBridge.bridge.deposit(
      tx.sender,
      tx.mainToken,
      tx.amount,
      data
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
        logger.debug('ForeignBridge resend tx error ->', err, receipt);

        if (txHash) {
          logger.error('failed w/ txHash', err, receipt);
          // this.updateTxData(Object.assign(tx, { status: 'failed', reSendError: err, reSendTxHash: txHash }));
        } else {
          this.updateTxData(Object.assign(tx, { status: 'failed-send', reSend: true, reSendError: err, reSendTxHash: false }));
        }
      });
  }

  getResendData(tx) {
    if (tx.giver) {
      return this.lp.$contract.methods.addGiverAndDonate(tx.receiverId, tx.giver, tx.mainToken, tx.amount).encodeABI();
    } else if (tx.giverId) {
      return this.lp.$contract.methods.donate(tx.giverId, tx.receiverId, tx.mainToken, tx.amount).encodeABI();
    } else {
      sendEmail(`Tx missing giver and giverId. Can't sendToParentProject\n\n ${JSON.stringify(tx, null, 2)}`);
      logger.error('Tx missing giver and giverId. Cant sendToGiver ->', tx);
      return;
    }
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
      });
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
      }, (err, data) => err ? reject(err) : resolve(data))
    });
  }

  getPendingTxs() {
    return new Promise((resolve, reject) => {
      this.db.txs.find({ status: 'pending' }, (err, data) => err ? reject(err) : resolve(data))
    });
  }
}
