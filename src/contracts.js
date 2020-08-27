const GivethBridgeArtifact = require('../build/GivethBridge.json');
const ForeignGivethBridgeArtifact = require('../build/ForeignGivethBridge.json');
const CSTokenGivethBridgeArtifact = require('../build/CSTokenGivethBridge.json')
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
    CSTokenGivethBridge: generateClass(
        CSTokenGivethBridgeArtifact.compilerOutput.abi,
        `0x${CSTokenGivethBridgeArtifact.compilerOutput.evm.bytecode.object}`,
    ),
};
