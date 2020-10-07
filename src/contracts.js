const GivethBridgeArtifact = require('../build/GivethBridge.json');
const ForeignGivethBridgeArtifact = require('../build/ForeignGivethBridge.json');
const CSTokenMinterArtifact = require('../build/Minter.json')
const CSTokenRegistryArtifact = require('../build/Registry.json')
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
    CSTokenMinter: generateClass(
        CSTokenMinterArtifact.compilerOutput.abi,
        `0x${CSTokenMinterArtifact.compilerOutput.evm.bytecode.object}`,
    ),
    CSTokenRegistry: generateClass(
        CSTokenRegistryArtifact.compilerOutput.abi,
        `0x${CSTokenRegistryArtifact.compilerOutput.evm.bytecode.object}`,
    ),
};
