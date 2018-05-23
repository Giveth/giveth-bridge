import Web3 from 'web3';

let homeWeb3;
let foreignWeb3;

export const getHomeWeb3 = config => {
    if (homeWeb3) return homeWeb3;

    homeWeb3 = new Web3(config.homeNodeUrl);
    homeWeb3.eth.defaultBlock = 'pending';
    const account = homeWeb3.eth.accounts.privateKeyToAccount(config.pk);
    homeWeb3.eth.accounts.wallet.add(account);

    return homeWeb3;
};

export const getForeignWeb3 = config => {
    if (foreignWeb3) return foreignWeb3;

    foreignWeb3 = new Web3(config.foreignNodeUrl);
    foreignWeb3.eth.defaultBlock = 'pending';
    const account = foreignWeb3.eth.accounts.privateKeyToAccount(config.pk);
    foreignWeb3.eth.accounts.wallet.add(account);

    return foreignWeb3;
};
