import logger from 'winston';
import { GivethBridge, ForeignGivethBridge } from './contracts';
import { LiquidPledging } from 'giveth-liquidpledging';

export default class {
    constructor(homeWeb3, foreignWeb3, address, foreignAddress) {
        this.web3 = homeWeb3;
        this.bridge = new GivethBridge(homeWeb3, address);
        this.foreignBridge = new ForeignGivethBridge(foreignWeb3, foreignAddress);
        this.lp = new LiquidPledging(foreignWeb3).$contract;
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

    getToken(mainToken) {
        return this.foreignBridge.tokenMapping(mainToken);
    }

    eventToTx(event) {
        logger.info('handling GivethBridge event: ', event);

        switch (event.event) {
            case 'Donate': {
                const { giverId, receiverId, token, amount } = event.returnValues;
                return Promise.all([
                    this.web3.eth.getTransaction(event.transactionHash),
                    this.getToken(token),
                ]).then(([tx, sideToken]) => {
                    if (!tx)
                        throw new Error(`Failed to fetch transaction ${event.transactionHash}`);
                    return {
                        homeTx: event.transactionHash,
                        giverId,
                        receiverId,
                        mainToken: token,
                        sideToken,
                        amount,
                        sender: tx.from,
                        data: this.lp.methods
                            .donate(giverId, receiverId, sideToken, amount)
                            .encodeABI(),
                    };
                });
            }
            case 'DonateAndCreateGiver': {
                const { giver, receiverId, token, amount } = event.returnValues;
                return Promise.all([
                    this.web3.eth.getTransaction(event.transactionHash),
                    this.getToken(token),
                ]).then(([tx, sideToken]) => {
                    if (!tx)
                        throw new Error(`Failed to fetch transaction ${event.transactionHash}`);
                    return {
                        homeTx: event.transactionHash,
                        giver,
                        receiverId,
                        mainToken: token,
                        sideToken,
                        amount,
                        sender: tx.from,
                        data: this.lp.methods
                            .addGiverAndDonate(receiverId, giver, sideToken, amount)
                            .encodeABI(),
                    };
                });
            }
            default:
                return Promise.resolve(undefined);
        }
    }
}
