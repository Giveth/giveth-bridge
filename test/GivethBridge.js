/* eslint-env mocha */
/* eslint-disable no-await-in-loop */
const getWeb3 = require('./helpers/getWeb3');
const chai = require('chai');
const contracts = require('../build/contracts/contracts');
const { StandardTokenTest, assertFail } = require('giveth-liquidpledging').test;

const assert = chai.assert;

describe('GivethBridge', function() {
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
    let receiver1;
    let receiver2;
    let ts = Math.round(new Date().getTime() / 1000);

    before(async () => {
        web3 = getWeb3();
        accounts = await web3.eth.getAccounts();

        giver1 = accounts[1];
        giver2 = accounts[2];
        owner = accounts[3];
        securityGuard = accounts[4];
        spender = accounts[5];
        receiver1 = accounts[6];
        receiver2 = accounts[7];
    });

    it('Should deploy Bridge contract', async function() {
        let fiveDays = 60 * 60 * 24 * 5;
        bridge = await contracts.GivethBridgeMock.new(
            web3,
            accounts[0],
            accounts[0],
            securityGuard,
            fiveDays,
            { from: owner, $extraGas: 100000 },
        );
        timeDelay = Number(await bridge.TIME_DELAY());

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

    // TODO: udate test & add more tests for vault
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
        ts += 10000;
        await bridge.setMockedTime(ts, { $extraGas: 100000 });
        await bridge.checkIn({ from: securityGuard });
        await assertFail(bridge.collectAuthorizedPayment(0, { from: receiver1, gas: 6700000 }));

        const preEthBal = await web3.eth.getBalance(receiver1);

        ts += timeDelay;
        await bridge.setMockedTime(ts, { $extraGas: 100000 });
        const { gasUsed } = await bridge.collectAuthorizedPayment(0, {
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

        await assertFail(bridge.collectAuthorizedPayment(1, { from: receiver2, gas: 6700000 }));
    });

    it('Should unpause contract', async function() {
        await bridge.unpause({ from: owner, $extraGas: 100000 });

        const paused = await bridge.paused();
        assert.isFalse(paused);
    });

    it('Only securityGuard should be able to delay payment', async function() {
        await assertFail(bridge.delayPayment(1, 10000, { from: receiver1, gas: 6700000 }));

        await bridge.delayPayment(1, 10000, { from: securityGuard, $extraGas: 100000 });

        // fail b/c payment delay
        await assertFail(bridge.collectAuthorizedPayment(1, { from: receiver2, gas: 6700000 }));

        const preTokenBal = await giverToken.balanceOf(receiver2);

        // delay is passed
        ts += 10001;
        await bridge.setMockedTime(ts, { $extraGas: 100000 });
        // fail b/c securityGuard hasn't checked in
        await assertFail(bridge.collectAuthorizedPayment(1, { from: receiver2, gas: 6700000 }));
        await bridge.checkIn({ from: securityGuard });
        // console.log('here');
        // await bridge.collectAuthorizedPayment(1, { from: receiver2, $extraGas: 100000 });
        //
        // const p2 = await bridge.authorizedPayments(1);
        // assert.isTrue(p2.paid);
        // assert.equal(p2.securityGuardDelay, 10000);
        // assert.equal(p2.earliestPayTime, ts);
        //
        // const tokenBal = await giverToken.balanceOf(receiver2);
        // assert.equal(
        // tokenBal,
        // web3.utils
        // .toBN(preTokenBal)
        // .addn(10)
        // .toString(),
        // );
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

        await assertFail(bridge.collectAuthorizedPayment(2, { from: receiver2, gas: 6700000 }));
    });
});
