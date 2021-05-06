import logger from 'winston';
import { sendEmail } from './utils';

const checkBalance = (config, web3) => {
    const { address } = web3.eth.accounts.wallet[0];

    web3.eth.getBalance(address).then(balanceWei => {
        const { fromWei } = web3.utils;
        const balanceEther = Number(fromWei(balanceWei));
        const balanceLimit = Number(config.balanceLimit || 0.1);

        if (balanceEther < balanceLimit) {
            const msg = `Bridge balance is less than limit\n\n    bridge address: ${address}\n\n    balance: ${balanceEther}`;
            logger.error(msg);
            sendEmail(config, msg);
        }
    });
};

export default checkBalance;
