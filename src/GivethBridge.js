import logger from 'winston';
import { GivethBridge, CSTokenMinter } from './contracts';

export default class {
    constructor(homeWeb3, foreignWeb3, address, foreignAddress) {
        this.web3 = homeWeb3;
        this.bridge = new GivethBridge(homeWeb3, address);
        this.foreignBridge = new CSTokenMinter(foreignWeb3, foreignAddress);
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
        logger.info('handling GivethBridge event: ', event);

        switch (event.event) {
            case 'Donate': {
                const { receiverId, token, amount } = event.returnValues;
                return Promise.all([this.web3.eth.getTransaction(event.transactionHash)]).then(
                    ([tx]) => {
                        if (!tx)
                            throw new Error(`Failed to fetch transaction ${event.transactionHash}`);
                        return {
                            homeTx: event.transactionHash,
                            receiverId,
                            token,
                            amount,
                            sender: tx.from,
                        };
                    },
                );
            }
            case 'DonateAndCreateGiver': {
                const { receiverId, token, amount } = event.returnValues;
                return Promise.all([this.web3.eth.getTransaction(event.transactionHash)]).then(
                    ([tx]) => {
                        if (!tx)
                            throw new Error(`Failed to fetch transaction ${event.transactionHash}`);
                        return {
                            homeTx: event.transactionHash,
                            receiverId,
                            token,
                            amount,
                            sender: tx.from,
                        };
                    },
                );
            }
            default:
                return Promise.resolve(undefined);
        }
    }
}
