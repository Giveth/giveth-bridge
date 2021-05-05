import logger from 'winston';
import { sendEmail } from './utils';

const checkBalance = (config, web3) => {
    const { address } = web3.eth.accounts.wallet[0];

    web3.eth.getBalance(address).then(balanceWei => {
        const { fromWei, toBN } = web3.utils;
        const balanceEther = toBN(fromWei(balanceWei));
        const balanceLimit = toBN(config.balanceLimit || 0.1);

        if (balanceEther.lt(balanceLimit)) {
            const msg = `Bridge balance is less than limit\n\n    balance: ${balanceEther.toString()}`;
            logger.error(msg);
            sendEmail(config, msg);
        }
    });
};

export default checkBalance;
