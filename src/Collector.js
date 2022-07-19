import logger from 'winston';
import { Collector } from './contracts';

export default class {
    constructor(homeWeb3, foreignWeb3, address) {
        this.web3 = homeWeb3;
        this.bridge = new Collector(homeWeb3, address);
    }

    getRelayTransactions(fromBlock, toBlock) {
        if (toBlock < fromBlock) {
            logger.debug(
                `GivethBridge -> toBlock: ${toBlock} < fromBlock: ${fromBlock} ... ignoring fetch getRelayTransactions request`,
            );
            return Promise.resolve([]);
        }
        return this.bridge.$contract
            .getPastEvents('allEvents', { fromBlock, toBlock })
            .then(events => events.map(e => this.eventToTx(e)))
            .then(promises => Promise.all(promises))
            .then(results => results.filter(r => r !== undefined));
    }

    eventToTx(event) {
        logger.info('handling Collector event: ', event);

        switch (event.event) {
            case 'Collected': {
                const { sender, amount } = event.returnValues;
                return Promise.all([this.web3.eth.getTransaction(event.transactionHash)]).then(
                    ([tx]) => {
                        if (!tx)
                            throw new Error(`Failed to fetch transaction ${event.transactionHash}`);
                        return {
                            homeTx: event.transactionHash,
                            amount,
                            sender,
                        };
                    },
                );
            }

            default:
                return Promise.resolve(undefined);
        }
    }
}
