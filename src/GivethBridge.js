import logger from 'winston';
import contracts from '../index';
import { LiquidPledging } from 'giveth-liquidpledging';

export default class GivethBridge {
  constructor(web3, address) {
    this.web3 = web3;
    this.bridge = new contracts.GivethBridge(web3, address);
    this.foreignBridge = new contracts.ForeignGivethBridge(web3, foreignAddress);
    this.lp = new LiquidPledging(web3).$contract;
  }

  getRelayTransactions(fromBlock, toBlock) {
    if (toBlock < fromBlock) return Promise.resolve([]);
    return this.bridge.$contract
      .getPastEvents('allEvents', { fromBlock, toBlock })
      .then((events) => events.map(this.eventToTx))
      .then(Promise.all);
  }

  getToken(mainToken) {
    return this.foreignBridge.tokenMapping(mainToken);
  }

  eventToTx(e) {
    logger.info('handling GivethBridge event: ', event);

    switch (event.event) {
      case 'Donate':
        const { giverId, receiverId, token, amount } = event.returnValues;
        return Promise.all([
          this.web3.eth.getTransaction(event.transactionHash),
          this.getToken(token)
        ])
          .then(([tx, sideToken]) => {
            return {
              giverId,
              receiverId,
              mainToken: token,
              sideToken,
              amount,
              sender: tx.from,
              data: this.lp.methods.Donate(giverId, receiverId, sideToken, amount).encodeABI(),
            }
          });
      case 'DonateAndCreateGiver':
        const { giver, receiverId, token, amount } = event.returnValues;
        return Promise.all([
          this.web3.eth.getTransaction(event.transactionHash),
          this.getToken(token)
        ])
          .then(([tx, sideToken]) => {
            return {
              giver,
              receiverId,
              mainToken: token,
              sideToken,
              amount,
              sender: tx.from,
              data: this.lp.methods.addGiverAndDonate(receiverId, giver, sideToken, amount).encodeABI(),
            }
          });
      default:
        return new Promise.resolve(undefined);
    }
  }
}