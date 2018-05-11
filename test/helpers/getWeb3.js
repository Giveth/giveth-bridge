const Web3 = require('web3');

let web3;
module.exports = () => {
  if (web3) return web3;

  web3 = new Web3('ws://localhost:8545');
  return web3;
}