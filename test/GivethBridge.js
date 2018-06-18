/* eslint-env mocha */
/* eslint-disable no-await-in-loop */
const TestRPC = require('ganache-cli');
const chai = require('chai');
const contracts = require('../build/contracts');
const { StandardTokenTest, assertFail } = require('giveth-liquidpledging').test;
const Web3 = require('web3');

const assert = chai.assert;

describe('GivethBridge test', function() {
    this.timeout(0);

    let web3;
    let accounts;
    let factory;
    let timeDelay;
    let bridge;
    let owner;
    let giver1;
    let giver2;
    let giverToken;
    let securityGuard;
    let spender;
    let testrpc;
    let receiver1;
    let receiver2;
    let ts = Math.round(new Date().getTime() / 1000);

    before(async () => {
        testrpc = TestRPC.server({
            ws: true,
            gasLimit: 6700000,
            total_accounts: 10,
        });

        testrpc.listen(8545, '127.0.0.1', err => {});

        web3 = new Web3('ws://localhost:8545');
        accounts = await web3.eth.getAccounts();

        giver1 = accounts[1];
        giver2 = accounts[2];
        owner = accounts[3];
        securityGuard = accounts[4];
        spender = accounts[5];
        receiver1 = accounts[6];
        receiver2 = accounts[7];
    });

    after(done => {
        testrpc.close();
        done();
    });

    it('Should deploy Bridge contract', async function() {
        let fiveDays = 60 * 60 * 24 * 5;
        timeDelay = 60 * 60 * 48;
        bridge = await contracts.GivethBridgeMock.new(
            web3,
            accounts[0],
            accounts[0],
            60 * 60 * 25,
            timeDelay,
            securityGuard,
            fiveDays,
            { from: owner, $extraGas: 100000 },
        );

        giverToken = await StandardTokenTest.new(web3);
        await giverToken.mint(giver1, web3.utils.toWei('1000'));
        await giverToken.approve(bridge.$address, '0xFFFFFFFFFFFFFFFF', { from: giver1 });

        await bridge.setMockedTime(ts, { $extraGas: 100000 });
    });

    it('Should emit event on donate', async function() {
        const r = await bridge.donate(1, 2, { value: 100 });
        const { giverId, receiverId, token, amount } = r.events.Donate.returnValues;

        const bal = await web3.eth.getBalance(bridge.$address);

        assert.equal(giverId, 1);
        assert.equal(receiverId, 2);
        assert.equal(token, 0);
        assert.equal(amount, 100);
        assert.equal(bal, 100);
    });

    it('Should emit event on donate', async function() {
        const r = await bridge.donateAndCreateGiver(accounts[6], 2, 0, 0, { value: 100 });
        const { giver, receiverId, token, amount } = r.events.DonateAndCreateGiver.returnValues;

        const bal = await web3.eth.getBalance(bridge.$address);

        assert.equal(giver, accounts[6]);
        assert.equal(receiverId, 2);
        assert.equal(token, 0);
        assert.equal(amount, 100);
        assert.equal(bal, 200);
    });

    it('Should fail for non-whitelisted token', async function() {
        await assertFail(
            bridge.donate(1, 2, giverToken.$address, 1000, { from: giver1, gas: 6700000 }),
        );
    });

    it('Should emit event on donate with token', async function() {
        await bridge.whitelistToken(giverToken.$address, true, { from: owner, $extraGas: 100000 });
        const r = await bridge.donate(1, 2, giverToken.$address, 1000, {
            from: giver1,
            $extraGas: 100000,
        });
        const { giverId, receiverId, token, amount } = r.events.Donate.returnValues;

        const bal = await giverToken.balanceOf(bridge.$address);

        assert.equal(giverId, 1);
        assert.equal(receiverId, 2);
        assert.equal(token, giverToken.$address);
        assert.equal(amount, 1000);

        assert.equal(bal, 1000);
    });

    // vault tests
    it('Should only allow owner to authorize a spender', async function() {
        await assertFail(bridge.authorizeSpender(spender, true, { gas: 6700000, from: giver1 }));

        await bridge.authorizeSpender(spender, true, { from: owner, $extraGas: 100000 });
        assert.isTrue(await bridge.allowedSpenders(spender));
    });

    it('Should only allow spender to authorizePayment', async function() {
        await assertFail(
            bridge.authorizePayment('payment 1', web3.utils.keccak256('ref'), receiver1, 0, 11, 0, {
                from: giver1,
                gas: 6700000,
            }),
        );

        await bridge.authorizePayment(
            'payment 1',
            web3.utils.keccak256('ref'),
            receiver1,
            0,
            11,
            timeDelay + 10000,
            { from: spender, $extraGas: 100000 },
        );
        await bridge.authorizePayment(
            'payment 2',
            web3.utils.keccak256('ref'),
            receiver2,
            giverToken.$address,
            10,
            timeDelay + 10000,
            { from: spender, $extraGas: 100000 },
        );

        const p1 = await bridge.authorizedPayments(0);
        const p2 = await bridge.authorizedPayments(1);

        assert.equal(receiver1, p1.recipient);
        assert.equal(receiver2, p2.recipient);
        assert.equal(0, p1.token);
        assert.equal(giverToken.$address, p2.token);
        assert.equal(11, p1.amount);
        assert.equal(10, p2.amount);
        assert.isFalse(p1.paid);
        assert.isFalse(p2.paid);
        assert.isFalse(p1.canceled);
        assert.isFalse(p2.canceled);
        assert.equal(p1.earliestPayTime, ts + timeDelay + 10000);
        assert.equal(p2.earliestPayTime, ts + timeDelay + 10000);
    });

    it('Should collect authorizedPayment', async function() {
        // fail before earliest pay time but w/ valid checkIn
        ts += 10000 + 60 * 30;
        await bridge.setMockedTime(ts, { $extraGas: 100000 });
        await bridge.checkIn({ from: securityGuard });
        await assertFail(bridge.disburseAuthorizedPayment(0, { from: receiver1, gas: 6700000 }));

        const preEthBal = await web3.eth.getBalance(receiver1);

        ts += timeDelay;
        await bridge.setMockedTime(ts, { $extraGas: 100000 });
        const { gasUsed } = await bridge.disburseAuthorizedPayment(0, {
            from: receiver1,
            gasPrice: 1,
            $extraGas: 100000,
        });

        const p1 = await bridge.authorizedPayments(0);
        assert.isTrue(p1.paid);

        const ethBal = await web3.eth.getBalance(receiver1);
        assert.equal(
            web3.utils
                .toBN(preEthBal)
                .addn(11)
                .subn(gasUsed)
                .toString(),
            ethBal,
        );
    });

    it('Should only allow owner to pause contract', async function() {
        await assertFail(bridge.pause({ from: giver1, gas: 6700000 }));

        await bridge.pause({ from: owner });

        const paused = await bridge.paused();
        assert.isTrue(paused);
    });

    it('Should not allow donations or withdrawl when paused', async function() {
        await assertFail(bridge.donate(1, 2, { value: 100, gas: 6700000 }));

        await assertFail(bridge.donate(1, 2, giverToken.$address, 100, { gas: 6700000 }));

        await assertFail(
            bridge.donateAndCreateGiver(giver2, 2, giverToken.$address, 100, { gas: 6700000 }),
        );

        await assertFail(
            bridge.authorizePayment('payment 1', web3.utils.keccak256('ref'), receiver1, 0, 11, 0, {
                from: spender,
                gas: 6700000,
            }),
        );

        await assertFail(bridge.disburseAuthorizedPayment(1, { from: receiver2, gas: 6700000 }));
    });

    it('Should unpause contract', async function() {
        await bridge.unpause({ from: owner, $extraGas: 100000 });

        const paused = await bridge.paused();
        assert.isFalse(paused);
    });

    it('Only securityGuard should be able to delay payment', async function() {
        // subtract (60 * 30) b/c a previous test adds that to ts, but is after the payment as been authorized
        const earliestPaytime = ts - 60 * 30 + 10000;
        await assertFail(bridge.delayPayment(1, 10000, { from: receiver1, gas: 6700000 }));

        await bridge.delayPayment(1, 10000, { from: securityGuard, $extraGas: 100000 });

        // fail b/c payment delay
        await assertFail(bridge.disburseAuthorizedPayment(1, { from: receiver2, gas: 6700000 }));

        const preTokenBal = await giverToken.balanceOf(receiver2);

        // delay is passed
        ts += 10001;
        await bridge.setMockedTime(ts, { $extraGas: 100000 });
        // fail b/c securityGuard hasn't checked in
        await assertFail(bridge.disburseAuthorizedPayment(1, { from: receiver2, gas: 6700000 }));
        await bridge.checkIn({ from: securityGuard });
        await bridge.disburseAuthorizedPayment(1, { from: receiver2, $extraGas: 100000 });

        const p2 = await bridge.authorizedPayments(1);
        assert.isTrue(p2.paid);
        assert.equal(p2.securityGuardDelay, 10000);
        assert.equal(p2.earliestPayTime, earliestPaytime);

        const tokenBal = await giverToken.balanceOf(receiver2);
        assert.equal(
            tokenBal,
            web3.utils
                .toBN(preTokenBal)
                .addn(10)
                .toString(),
        );
    });

    it('Should allow owner to cancel payment', async function() {
        await bridge.authorizePayment(
            'payment 3',
            web3.utils.keccak256('ref'),
            receiver2,
            0,
            111,
            0,
            { from: spender, $extraGas: 100000 },
        );

        await assertFail(bridge.cancelPayment(2, { from: spender, gas: 6700000 }));

        await bridge.cancelPayment(2, { from: owner, $extraGas: 100000 });

        const p2 = await bridge.authorizedPayments(2);
        assert.isFalse(p2.paid);
        assert.isTrue(p2.canceled);

        await assertFail(bridge.disburseAuthorizedPayment(2, { from: receiver2, gas: 6700000 }));
    });

    it('Should dispurse payments', async function() {
        ts += 1000000;
        await bridge.setMockedTime(ts, { $extraGas: 100000 });

        await bridge.authorizePayment(
            'payment 4',
            web3.utils.keccak256('ref'),
            receiver2,
            0,
            11,
            0,
            { from: spender, $extraGas: 100000 },
        );
        await bridge.authorizePayment(
            'payment 5',
            web3.utils.keccak256('ref'),
            receiver1,
            0,
            9,
            0,
            { from: spender, $extraGas: 100000 },
        );

        ts += timeDelay;
        await bridge.setMockedTime(ts, { $extraGas: 100000 });
        // should fail before checkIn
        await assertFail(bridge.disburseAuthorizedPayments([3, 4], { from: giver1, gas: 6700000 }));
        await bridge.checkIn({ from: securityGuard });

        const receiver1Bal = await web3.eth.getBalance(receiver1);
        const receiver2Bal = await web3.eth.getBalance(receiver2);

        await bridge.disburseAuthorizedPayments([3, 4], { from: giver1, $extraGas: 100000 });

        const receiver1BalPost = await web3.eth.getBalance(receiver1);
        const receiver2BalPost = await web3.eth.getBalance(receiver2);

        assert.equal(
            web3.utils
                .toBN(receiver1Bal)
                .addn(9)
                .toString(),
            receiver1BalPost,
        );
        assert.equal(
            web3.utils
                .toBN(receiver2Bal)
                .addn(11)
                .toString(),
            receiver2BalPost,
        );
    });

    it('Should only disburse payments whenPaused and allowDisbursePaymentWhenPaused is true', async function() {
        await bridge.authorizePayment(
            'payment 6',
            web3.utils.keccak256('ref'),
            receiver1,
            0,
            3,
            0,
            { from: spender, $extraGas: 100000 },
        );

        // can only call allowDisbursePaymentWhenPaused if currently paused
        await assertFail(bridge.setAllowDisbursePaymentWhenPaused(true, { from: owner, gas: 6700000 }));

        // pause the contract
        await bridge.pause({ from: owner });

        // set allowDisbursePaymentWhenPaused
        await bridge.setAllowDisbursePaymentWhenPaused(true, { from: owner });
        assert.equal(await bridge.allowDisbursePaymentWhenPaused(), true);

        ts += timeDelay;
        await bridge.setMockedTime(ts, { $extraGas: 100000 });
        await bridge.checkIn({ from: securityGuard });

        // unpausing & repausing contract should reset setAllowDisbursePaymentWhenPaused
        await bridge.unpause({ from: owner, $extraGas: 100000 });
        await bridge.pause({ from: owner, $extraGas: 100000 });
        assert.equal(await bridge.allowDisbursePaymentWhenPaused(), false);

        const receiver1Bal = await web3.eth.getBalance(receiver1);

        await bridge.setAllowDisbursePaymentWhenPaused(true, { from: owner });
        assert.equal(await bridge.allowDisbursePaymentWhenPaused(), true);

        await bridge.disburseAuthorizedPayment(5, { from: giver1, $extraGas: 100000 });

        const receiver1BalPost = await web3.eth.getBalance(receiver1);
        assert.equal(
          web3.utils
              .toBN(receiver1Bal)
              .addn(3)
              .toString(),
          receiver1BalPost,
      );
    });
});
