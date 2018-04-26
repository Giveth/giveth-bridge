const homeBridgeInfo = require('./build/GivethBridge.sol');
const foreignBridgeInfo = require('./build/ForeignGivethBridge.sol');
const generateClass = require('eth-contract-class').default;

module.exports = {
    GivethBridge: generateClass(
        homeBridgeInfo.GivethBridgeAbi,
        homeBridgeInfo.GivethBridgeByteCode,
    ),
    ForeignGivethBridge: generateClass(
        foreignBridgeInfo.ForeignGivethBridgeAbi,
        foreignBridgeInfo.ForeignGivethBridgeByteCode,
    ),
};
