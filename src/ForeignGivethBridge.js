import logger from 'winston';
import { GivethBridge, ForeignGivethBridge } from './contracts';

export default class {
  constructor(web3, address) {
    this.web3 = web3;
    this.bridge = new ForeignGivethBridge(web3, address);
    // passing wrong web3 instance here b/c it doesn't matter
    // only using this object to generate the call data to the
    // homeBridge
    this.homeBridge = new GivethBridge(web3).$contract;
  }

  getRelayTransactions(fromBlock, toBlock) {
    if (toBlock < fromBlock) {
      logger.debug(`ForeignGivethBridge  -> toBlock: ${toBlock} < fromBlock: ${fromBlock} ... ignoring fetch getRelayTransactions request`);
      return Promise.resolve([]);
    }

    return this.bridge.$contract
      .getPastEvents('Withdraw', { fromBlock, toBlock })
      .then((events) => events.map(e => this.eventToTx(e)))
      .then(promises => Promise.all(promises))
      .then((results) => results.filter(r => r !== undefined));
  }

  eventToTx(event) {
    logger.info('handling ForeignGivethBridge event: ', event);

    switch (event.event) {
      case 'Withdraw':
        return this.web3.eth.getTransaction(event.transactionHash)
          .then(tx => Object.assign({}, event.returnValues, {
            foreignTx: event.transactionHash
          }));
      default:
        return Promise.resolve(undefined);
    }
  }
}