import logger from 'winston';
import { LiquidPledging } from 'giveth-liquidpledging';
import { ForeignGivethBridge, GivethBridge } from '@giveth/bridge-contract';

const fetch = require('node-fetch');

export default class {
    private readonly web3;
    private readonly bridge;
    private readonly foreignBridge;
    private readonly lp;
    private readonly feathersDappConnection;

    constructor(homeWeb3, foreignWeb3, address, foreignAddress, feathersDappConnection) {
        this.web3 = homeWeb3;
        this.bridge = new GivethBridge(homeWeb3, address);
        this.foreignBridge = new ForeignGivethBridge(foreignWeb3, foreignAddress);
        this.lp = new LiquidPledging(foreignWeb3).$contract;
        this.feathersDappConnection = feathersDappConnection;
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

    async fetchGiverId(giver) {
        let giverId;
        try {
            if (this.feathersDappConnection) {
                const response = await fetch(`${this.feathersDappConnection}/users/${giver}`);
                if (response.ok) {
                    const userInfo = await response.json();
                    if (userInfo.giverId) giverId = String(userInfo.giverId);
                }
            }
        } catch (e) {
            logger.debug(`Could not fetch user ${giver} from feathers DApp`);
        }

        return giverId;
    }

    async eventToTx(event) {
        logger.info('handling GivethBridge event: ', event);

        const { transactionHash, event: eventType, returnValues } = event;

        if (['Donate', 'DonateAndCreateGiver'].includes(eventType)) {
            const { receiverId, token, amount } = returnValues;
            const { giver } = returnValues;
            let { giverId } = returnValues;

            if (eventType === 'DonateAndCreateGiver') {
                giverId = await this.fetchGiverId(giver);
            }

            return Promise.all([
                this.web3.eth.getTransaction(transactionHash),
                this.getToken(token),
            ]).then(([tx, sideToken]) => {
                if (!tx) throw new Error(`Failed to fetch transaction ${transactionHash}`);
                const result = {
                    homeTx: transactionHash,
                    receiverId,
                    mainToken: token,
                    sideToken,
                    amount,
                    sender: tx.from,
                };
                if (giverId) {
                    return Object.assign(result, {
                        giverId,
                        data: this.lp.methods
                            .donate(giverId, receiverId, sideToken, amount)
                            .encodeABI(),
                    });
                }
                return Object.assign(result, {
                    giver,
                    data: this.lp.methods
                        .addGiverAndDonate(receiverId, giver, sideToken, amount)
                        .encodeABI(),
                });
            });
        }
        return undefined;
    }
}
