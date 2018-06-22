import Web3 from 'web3';
import Ganache from 'ganache-cli';
import contracts from '../../build/contracts';
import { LiquidPledging, LPVault, LPFactory, test } from 'giveth-liquidpledging';
import lpContracts from 'giveth-liquidpledging/build/contracts';
import { MiniMeToken, MiniMeTokenFactory, MiniMeTokenState } from 'minimetoken';
import config from '../../src/configuration';
const { StandardTokenTest, assertFail } = test;

export default async () => {
    // start networks
    const homeNetwork = Ganache.server({
        gasLimit: 6700000,
        total_accounts: 11,
        seed: 'homeNetwork',
    });

    const foreignNetwork = Ganache.server({
        gasLimit: 6700000,
        // blockTime: .1,
        total_accounts: 11,
        seed: 'foreignNetwork',
        // logger: console,
    });

    const homeAccountPKs = await new Promise((resolve, reject) => {
        homeNetwork.listen(8545, '127.0.0.1', (err, result) => {
            const state = result ? result : homeNetwork.provider.manager.state;
            resolve(Object.values(state.accounts).map(a => '0x' + a.secretKey.toString('hex')));
        });
    });
    foreignNetwork.listen(8546, '127.0.0.1', err => {});

    // init web3
    const homeWeb3 = new Web3('http://localhost:8545');
    const foreignWeb3 = new Web3('http://localhost:8546');

    // get accounts
    const homeAccounts = await homeWeb3.eth.getAccounts();
    const foreignAccounts = await foreignWeb3.eth.getAccounts();

    const a = homeWeb3.eth.accounts.privateKeyToAccount(config.pk);
    await homeWeb3.eth.sendTransaction({
        from: homeAccounts[10],
        to: a.address,
        value: 10000000000000000000,
    });
    await foreignWeb3.eth.sendTransaction({
        from: foreignAccounts[10],
        to: a.address,
        value: 10000000000000000000,
    });
    homeWeb3.eth.accounts.wallet.add(a);
    foreignWeb3.eth.accounts.wallet.add(a);
    homeAccounts.pop();
    foreignAccounts.pop();

    // add home accounts to foreignWallet & send them some eth.
    // bridge will transfer assets to same account on the foreignNetwork
    // this will allow use to use homeAccounts on the foreignNetwork
    for (var i = 0; i < homeAccounts.length; i++) {
        await foreignWeb3.eth.sendTransaction({
            from: foreignAccounts[i],
            to: homeAccounts[i],
            value: 50000000000000000000,
        });
        const a = foreignWeb3.eth.accounts.privateKeyToAccount(homeAccountPKs[i]);
        foreignWeb3.eth.accounts.wallet.add(a);
    }

    const tokenFactory = await MiniMeTokenFactory.new(foreignWeb3, { gas: 3000000 });

    const baseVault = await LPVault.new(foreignWeb3, foreignAccounts[0]);
    const baseLP = await LiquidPledging.new(foreignWeb3, foreignAccounts[0]);
    const lpFactory = await LPFactory.new(foreignWeb3, baseVault.$address, baseLP.$address);

    const r = await lpFactory.newLP(foreignAccounts[0], foreignAccounts[1], { $extraGas: 200000 });

    const vaultAddress = r.events.DeployVault.returnValues.vault;
    const vault = new LPVault(foreignWeb3, vaultAddress);

    const lpAddress = r.events.DeployLiquidPledging.returnValues.liquidPledging;
    const liquidPledging = new LiquidPledging(foreignWeb3, lpAddress);

    // set permissions
    const vaultOwner = foreignAccounts[2];
    const foreignBridgeOwner = a.address;

    const kernel = new lpContracts.Kernel(foreignWeb3, await liquidPledging.kernel());
    const acl = new lpContracts.ACL(foreignWeb3, await kernel.acl());
    await acl.createPermission(
        vaultOwner,
        vault.$address,
        await vault.CONFIRM_PAYMENT_ROLE(),
        vaultOwner,
        { $extraGas: 200000 },
    );
    await acl.createPermission(
        vaultOwner,
        vault.$address,
        await vault.SET_AUTOPAY_ROLE(),
        vaultOwner,
        { $extraGas: 200000 },
    );
    await vault.setAutopay(true, { from: vaultOwner, $extraGas: 100000 });

    // deploy bridges
    const foreignBridge = await contracts.ForeignGivethBridge.new(
        foreignWeb3,
        foreignAccounts[0],
        foreignAccounts[0],
        tokenFactory.$address,
        liquidPledging.$address,
        foreignBridgeOwner,
        [],
        [],
        { from: foreignBridgeOwner, $extraGas: 100000 },
    );

    const homeBridgeOwner = homeAccounts[1];
    const securityGuard = homeAccounts[2];

    let fiveDays = 60 * 60 * 24 * 5;
    const homeBridge = await contracts.GivethBridgeMock.new(
        homeWeb3,
        homeAccounts[0],
        homeAccounts[0],
        60 * 60 * 25,
        60 * 60 * 48,
        securityGuard,
        fiveDays,
        { from: homeBridgeOwner, $extraGas: 100000 },
    );

    await homeBridge.authorizeSpender(a.address, true, { from: homeBridgeOwner });

    const homeToken1 = await StandardTokenTest.new(homeWeb3);

    // deploy tokens
    await foreignBridge.addToken(0, 'Foreign ETH', 18, 'FETH', { from: foreignBridgeOwner });
    const foreignEthAddress = await foreignBridge.tokenMapping(0);
    const foreignEth = new MiniMeToken(foreignWeb3, foreignEthAddress);

    return {
        homeNetwork,
        foreignNetwork,
        homeWeb3,
        foreignWeb3,
        homeAccounts,
        foreignAccounts,
        vault,
        liquidPledging,
        foreignBridge,
        foreignBridgeOwner,
        vaultOwner,
        foreignEth,
        homeBridge,
        homeBridgeOwner,
        securityGuard,
        homeToken1,
    };
};
