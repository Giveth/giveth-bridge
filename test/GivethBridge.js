/* eslint-env mocha */
/* eslint-disable no-await-in-loop */
const TestRPC = require('ganache-cli');
const chai = require('chai');
const contracts = require('../build/contracts');
const { StandardTokenTest, assertFail } = require('giveth-liquidpledging').test;
const Web3 = require('web3');

const assert = chai.assert;

describe('GivethBridge test', function () {
  this.timeout(0);

  let web3;
  let accounts;
  let factory;
  let bridge;
  let owner;
  let giver1;
  let giver2;
  let giverToken;
  let testrpc;

  before(async () => {
    testrpc = TestRPC.server({
      ws: true,
      gasLimit: 6700000,
      total_accounts: 10,
    });

    testrpc.listen(8545, '127.0.0.1', (err) => { });

    web3 = new Web3('ws://localhost:8545');
    accounts = await web3.eth.getAccounts();

    giver1 = accounts[1];
    giver2 = accounts[2];
    owner = accounts[3];
  });

  after((done) => {
    testrpc.close();
    done();
  });

  it('Should deploy Bridge contract', async function () {
    const baseBridge = await contracts.GivethBridge.new(web3);

    let bridgeAddress;
    await contracts.GivethBridgeFactory.new(web3, baseBridge.$address, owner, accounts[0], accounts[0], { $extraGas: 100000 })
      .on('receipt', r => {
        bridgeAddress = r.events.Deployed.returnValues.destination;
      });

    bridge = new contracts.GivethBridge(web3, bridgeAddress);

    giverToken = await StandardTokenTest.new(web3);
    await giverToken.mint(giver1, web3.utils.toWei('1000'));
    await giverToken.approve(bridge.$address, "0xFFFFFFFFFFFFFFFF", { from: giver1 });
  });

  it('Should emit event on donate', async function () {
    const r = await bridge.donate(1, 2, { value: 100 });
    const { giverId, receiverId, token, amount } = r.events.Donate.returnValues;

    const bal = await web3.eth.getBalance(bridge.$address);

    assert.equal(giverId, 1);
    assert.equal(receiverId, 2);
    assert.equal(token, 0);
    assert.equal(amount, 100);
    assert.equal(bal, 100);
  })

  it('Should emit event on donate', async function () {
    const r = await bridge.donateAndCreateGiver(accounts[6], 2, 0, 0, { value: 100 });
    const { giver, receiverId, token, amount } = r.events.DonateAndCreateGiver.returnValues;

    const bal = await web3.eth.getBalance(bridge.$address);

    assert.equal(giver, accounts[6]);
    assert.equal(receiverId, 2);
    assert.equal(token, 0);
    assert.equal(amount, 100);
    assert.equal(bal, 200);
  })

  it('Should emit event on donate with token', async function () {
    const r = await bridge.donate(1, 2, giverToken.$address, 1000, { from: giver1 });
    const { giverId, receiverId, token, amount } = r.events.Donate.returnValues;

    const bal = await giverToken.balanceOf(bridge.$address);

    assert.equal(giverId, 1);
    assert.equal(receiverId, 2);
    assert.equal(token, giverToken.$address);
    assert.equal(amount, 1000);

    assert.equal(bal, 1000);
  })

  it('Should only allow owner to withdraw tokens and eth', async function () {
    const receiver1 = accounts[6];
    const receiver2 = accounts[7];

    const preEthBal = await web3.eth.getBalance(receiver1);
    const preTokenBal = await giverToken.balanceOf(receiver2);

    const addresses = [receiver1, receiver2];
    const tokens = [0, giverToken.$address];
    const amounts = [11, 10];

    await assertFail(
      bridge.withdraw(addresses, tokens, amounts, { from: giver1, gas: 6700000 })
    );

    const r = await bridge.withdraw(addresses, tokens, amounts, { from: owner, $extraGas: 100000 });

    const events = r.events.Withdraw;
    assert.equal(events.length, 2);

    assert.equal(events[0].returnValues.receiver, receiver1);
    assert.equal(events[0].returnValues.token, 0);
    assert.equal(events[0].returnValues.amount, 11);

    assert.equal(events[1].returnValues.receiver, receiver2);
    assert.equal(events[1].returnValues.token, giverToken.$address);
    assert.equal(events[1].returnValues.amount, 10);

    const ethBal = await web3.eth.getBalance(receiver1);
    const tokenBal = await giverToken.balanceOf(receiver2);

    assert.equal(ethBal, web3.utils.toBN(preEthBal).addn(11).toString());
    assert.equal(tokenBal, web3.utils.toBN(preTokenBal).addn(10).toString());
  })

  it('Should only allow owner to pause contract', async function () {
    await assertFail(
      bridge.pause({ from: giver1, gas: 6700000 })
    );

    await bridge.pause({ from: owner });

    const paused = await bridge.paused();
    assert.isTrue(paused);
  })

  it('Should not allow donations or withdrawl when paused', async function () {
    await assertFail(
      bridge.donate(1, 2, { value: 100, gas: 6700000 })
    );

    await assertFail(
      bridge.donate(1, 2, giverToken.$address, 100, { gas: 6700000 })
    );

    await assertFail(
      bridge.donateAndCreateGiver(giver2, 2, giverToken.$address, 100, { gas: 6700000 })
    );

    await assertFail(
      bridge.withdraw([giver1], [0], [11], { gas: 6700000 })
    );
  })
});