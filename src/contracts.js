const GivethBridgeArtifact = require('../assets/artifacts/GivethBridge.json');
const ForeignGivethBridgeArtifact = require('../assets/artifacts/ForeignGivethBridge.json');
const generateClass = require('eth-contract-class').default;

module.exports = {
    GivethBridge: generateClass(
        GivethBridgeArtifact.compilerOutput.abi,
        `0x${GivethBridgeArtifact.compilerOutput.evm.bytecode.object}`,
    ),
    ForeignGivethBridge: generateClass(
        ForeignGivethBridgeArtifact.compilerOutput.abi,
        `0x${ForeignGivethBridgeArtifact.compilerOutput.evm.bytecode.object}`,
    ),
};
