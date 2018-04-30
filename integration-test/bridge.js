import rimraf from 'rimraf';
import path from 'path';
import chai from 'chai';
import logger from 'winston';
import { LiquidPledgingState } from 'giveth-liquidpledging';
import deploy from './helpers/deploy';
import config from '../src/configuration';
import { testBridge } from '../src/bridge';

const assert = chai.assert;

const printState = async lpState => {
    console.log(JSON.stringify(await lpState.getState(), null, 2));
};

const runBridge = (bridge, logLevel = 'none') => {
    logger.level = logLevel;

    return bridge.relayer.poll().then(() => bridge.verifyer.verify());
};

const extendWeb3 = web3 => {
    web3.extend({
        property: 'eth',
        methods: [
            {
                name: 'snapshot',
                call: 'evm_snapshot',
            },
            {
                name: 'revertToSnapshot',
                call: 'evm_revert',
                params: 1,
            },
            {
                name: 'mineBlock',
                call: 'evm_mine',
            },
        ],
    });
};

describe('Bridge Integration Tests', function() {
    this.timeout(0);

    let snapshotId;
    let deployData;
    let liquidPledging;
    let liquidPledgingState;
    let vault;
    let foreignBridge;
    let homeBridge;
    let homeWeb3;
    let foreignWeb3;
    let bridge;
    let foreignEth;
    let project1Admin;
    let project1;
    let giver1;
    let giver2;

    before(async () => {
        rimraf.sync(path.join(__dirname, 'data/*.db'), {}, console.log);

        deployData = await deploy();
        liquidPledging = deployData.liquidPledging;
        liquidPledgingState = new LiquidPledgingState(liquidPledging);
        vault = deployData.vault;
        foreignBridge = deployData.foreignBridge;
        homeBridge = deployData.homeBridge;
        homeWeb3 = deployData.homeWeb3;
        foreignWeb3 = deployData.foreignWeb3;
        foreignEth = deployData.foreignEth;

        extendWeb3(homeWeb3);
        extendWeb3(foreignWeb3);

        project1Admin = deployData.foreignAccounts[4];
        giver1 = deployData.homeAccounts[3];
        giver2 = deployData.homeAccounts[4];
        await liquidPledging.addProject('Project1', '', project1Admin, 0, 0, 0, {
            from: project1Admin,
            $extraGas: 100000,
        });
        project1 = 1; // admin 1

        // bridge = testBridge(false);
        bridge = testBridge(true);
    });

    beforeEach(async function() {
        // bug in ganache-cli prevents rolling back to same snapshot multiple times
        // https://github.com/trufflesuite/ganache-core/issues/104
        snapshotId = await foreignWeb3.eth.snapshot();
        await homeWeb3.eth.snapshot();
        if (bridge.relayer.bridgeData) {
            // reset last Relayed b/c some tests advance the block before running the bridge, thus
            // the bridge lastRelayed may be > current block
            bridge.relayer.bridgeData.homeBlockLastRelayed =
                (await homeWeb3.eth.getBlockNumber()) - 1;
            bridge.relayer.bridgeData.foreignBlockLastRelayed =
                (await foreignWeb3.eth.getBlockNumber()) - 1;
        }
    });

    afterEach(async function() {
        await foreignWeb3.eth.revertToSnapshot(snapshotId);
        await homeWeb3.eth.revertToSnapshot(snapshotId);
        // TODO may want to clear db here
        // bridge.db.txs.remove({}, {});
    });

    after(async () => {
        if (deployData) {
            deployData.homeNetwork.close();
            deployData.foreignNetwork.close();
        }
        // web3 prevents closing ganache. I believe due to listeners it attaches
        setTimeout(() => process.exit(0), 1000);
    });

    it('Should bridge donateAndCreateGiver', async function() {
        await homeBridge.donateAndCreateGiver(giver1, project1, 0, 1000, {
            from: giver1,
            value: 1000,
        });

        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(2);
        assert.equal(p.amount, 1000);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, project1);
    });

    it('Should bridge donate', async function() {
        await liquidPledging.addGiver('Giver1', '', 0, 0, { from: giver1, $extraGas: 100000 }); // admin 2
        await homeBridge.donate(2, project1, { from: giver1, value: 1000 });

        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(2);
        assert.equal(p.amount, 1000);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, project1);
    });

    it('Should bridge donate via proxy', async function() {
        await liquidPledging.addGiver('Giver1', '', 0, 0, { from: giver1, $extraGas: 100000 }); // admin 2
        // note: giver2 sends funds, but giver1 should be the "giver" in lp
        await homeBridge.donate(2, project1, { from: giver2, value: 1000 });

        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(2);
        assert.equal(p.amount, 1000);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, project1);
        assert.equal(p.oldPledge, 1);

        const giverP = await liquidPledging.getPledge(1);
        assert.equal(giverP.owner, 2);
        const admin = await liquidPledging.getPledgeAdmin(2);
        assert.equal(admin.addr, giver1);
    });

    it('Should bridge donateAndCreateGiver via proxy', async function() {
        await homeBridge.donateAndCreateGiver(giver1, project1, 0, 1000, {
            from: giver2,
            value: 1000,
        });

        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(2);
        assert.equal(p.amount, 1000);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, project1);
        assert.equal(p.oldPledge, 1);

        const giverP = await liquidPledging.getPledge(1);
        assert.equal(giverP.owner, 2);
        const admin = await liquidPledging.getPledgeAdmin(2);
        assert.equal(admin.addr, giver1);
    });

    it('Should bridge withdraw', async function() {
        await homeBridge.donateAndCreateGiver(giver1, project1, 0, 1000, {
            from: giver2,
            value: 1000,
        });
        await runBridge(bridge);
        await liquidPledging.withdraw(2, 1000, { from: project1Admin, $extraGas: 100000 });

        const bal = await foreignEth.balanceOf(project1Admin);
        assert.equal(bal, 1000);

        const { transactionHash } = await foreignBridge.withdraw(foreignEth.$address, 1000, {
            from: project1Admin,
            $extraGas: 100000,
        });
        await runBridge(bridge);

        const afterBal = await foreignEth.balanceOf(project1Admin);
        assert.equal(afterBal, 0);

        const p = await homeBridge.authorizedPayments(0);
        assert.equal(p.reference, transactionHash);
        assert.equal(p.canceled, false);
        assert.equal(p.paid, false);
        assert.equal(p.recipient, project1Admin);
        assert.equal(p.token, 0);
        assert.equal(p.amount, 1000);
    });

    it('Should donate to giver for failed donate & no parentProject for receiver', async function() {
        await liquidPledging.addGiver('Giver1', '', 0, 0, { from: giver1, $extraGas: 100000 }); // admin 2
        await homeBridge.donate(2, 5, { from: giver1, value: 1000 });

        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(1);
        assert.equal(p.amount, 1000);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, 2);

        const admin = await liquidPledging.getPledgeAdmin(2);
        assert.equal(admin.addr, giver1);
    });

    it('Should donate to parentProject for donate to canceled project', async function() {
        const project2Admin = deployData.foreignAccounts[5];
        await liquidPledging.addGiver('Giver1', '', 0, 0, { from: giver1, $extraGas: 100000 }); // admin 2
        await liquidPledging.addProject('Project2', '', project2Admin, 1, 0, 0, {
            from: project2Admin,
            $extraGas: 100000,
        }); // admin 3
        await liquidPledging.cancelProject(3, { from: project2Admin, $extraGas: 100000 });
        await homeBridge.donate(2, 3, { from: giver1, value: 1000 });

        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(2);
        assert.equal(p.amount, 1000);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, 1);
    });

    it('Should donate to giver for failed donate & receiver parentProject is canceled', async function() {
        const project2Admin = deployData.foreignAccounts[5];
        await liquidPledging.addGiver('Giver1', '', 0, 0, { from: giver1, $extraGas: 100000 }); // admin 2
        await liquidPledging.addProject('Project2', '', project2Admin, 1, 0, 0, {
            from: project2Admin,
            $extraGas: 100000,
        }); // admin 3
        await liquidPledging.cancelProject(1, { from: project1Admin, $extraGas: 100000 });
        await homeBridge.donate(2, 3, { from: giver1, value: 1000 });

        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(1);
        assert.equal(p.amount, 1000);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, 2);

        const admin = await liquidPledging.getPledgeAdmin(2);
        assert.equal(admin.addr, giver1);
    });

    it('Should donate to parentProject for donateAndCreateGiver to canceled project', async function() {
        const project2Admin = deployData.foreignAccounts[5];
        await liquidPledging.addProject('Project2', '', project2Admin, 1, 0, 0, {
            from: project2Admin,
            $extraGas: 100000,
        }); // admin 2
        await liquidPledging.cancelProject(2, { from: project2Admin, $extraGas: 100000 });
        await homeBridge.donateAndCreateGiver(giver1, 2, { from: giver1, value: 1000 });

        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(2);
        assert.equal(p.amount, 1000);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, 1);

        const admin = await liquidPledging.getPledgeAdmin(3);
        assert.equal(admin.addr, giver1);
        assert.equal(admin.adminType, 0); // giver type
    });

    it('Should create and donate to giver for failed donateAndCreateGiver & no parentProject for receiver', async function() {
        await homeBridge.donateAndCreateGiver(giver1, 5, { from: giver1, value: 1000 });

        // need to run 2x because bridge will issue 1 tx to
        // create the giver, and another to send the funds
        await runBridge(bridge);
        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(1);
        assert.equal(p.amount, 1000);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, 2);

        const admin = await liquidPledging.getPledgeAdmin(2);
        assert.equal(admin.addr, giver1);
    });

    it('Should create giver for failed donate & invalid giverId', async function() {
        await homeBridge.donate(2, 1, { from: giver1, value: 1000 });

        await runBridge(bridge);
        await runBridge(bridge);

        const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
        assert.equal(homeBal, 1000);

        const vaultBal = await foreignEth.balanceOf(vault.$address);
        assert.equal(vaultBal, 1000);

        const p = await liquidPledging.getPledge(1);
        assert.equal(p.amount, 0);
        assert.equal(p.token, foreignEth.$address);
        assert.equal(p.owner, 2);

        const p2 = await liquidPledging.getPledge(2);
        assert.equal(p2.amount, 1000);
        assert.equal(p2.token, foreignEth.$address);
        assert.equal(p2.owner, 1);
    });

    it('Should create giver and send funds to giver for failed donate & invalid giverId & invalid receiverId', async function() {
      await homeBridge.donate(2, 3, { from: giver1, value: 1000 });

      await runBridge(bridge);
      await runBridge(bridge);

      const homeBal = await homeWeb3.eth.getBalance(homeBridge.$address);
      assert.equal(homeBal, 1000);

      const vaultBal = await foreignEth.balanceOf(vault.$address);
      assert.equal(vaultBal, 1000);

      const p = await liquidPledging.getPledge(1);
      assert.equal(p.amount, 1000);
      assert.equal(p.token, foreignEth.$address);
      assert.equal(p.owner, 2);
  });
});
