const generateClass = require('eth-contract-class').default;
const GivethBridgeArtifact = require('../build/GivethBridge.json');
const ForeignGivethBridgeArtifact = require('../build/ForeignGivethBridge.json');
const CSTokenRegistryArtifact = require('../build/Registry.json');
const CollectorArtifact = require('../assets/contractArtifacts/collector.json');

module.exports = {
    GivethBridge: generateClass(
        GivethBridgeArtifact.compilerOutput.abi,
        `0x${GivethBridgeArtifact.compilerOutput.evm.bytecode.object}`,
    ),
    ForeignGivethBridge: generateClass(
        ForeignGivethBridgeArtifact.compilerOutput.abi,
        `0x${ForeignGivethBridgeArtifact.compilerOutput.evm.bytecode.object}`,
    ),
    CSTokenRegistry: generateClass(
        CSTokenRegistryArtifact.compilerOutput.abi,
        `0x${CSTokenRegistryArtifact.compilerOutput.evm.bytecode.object}`,
    ),
    Collector: generateClass(CollectorArtifact.abi, `0x${CollectorArtifact.bytecode}`),
};
