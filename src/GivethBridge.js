import logger from 'winston';
import contracts from '../index';
import { LiquidPledging } from 'giveth-liquidpledging';

export default class GivethBridge {
  constructor(homeWeb3, foreighWeb3, address, foreignAddress) {
    this.web3 = homeWeb3;
    this.bridge = new contracts.GivethBridge(homeWeb3, address);
    this.foreignBridge = new contracts.ForeignGivethBridge(foreighWeb3, foreignAddress);
    this.lp = new LiquidPledging(foreighWeb3).$contract;
  }

  getRelayTransactions(fromBlock, toBlock) {
    if (toBlock < fromBlock) return Promise.resolve([]);
    return this.bridge.$contract
      .getPastEvents('allEvents', { fromBlock, toBlock })
      .then((events) => events.map(e => this.eventToTx(e)))
      .then((promises) => Promise.all(promises));
  }

  getToken(mainToken) {
    return this.foreignBridge.tokenMapping(mainToken)
  }

  eventToTx(event) {
    logger.info('handling GivethBridge event: ', event);

    switch (event.event) {
      case 'Donate': {
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
              data: this.lp.methods.donate(giverId, receiverId, sideToken, amount).encodeABI(),
            }
          });
      } case 'DonateAndCreateGiver': {
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
      } default:
        return new Promise.resolve(undefined);
    }
  }
}