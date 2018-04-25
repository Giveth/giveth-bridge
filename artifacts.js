const fs = require('fs');
const mkdirp = require('mkdirp');

const standardOutput = JSON.parse(
    fs.readFileSync('./build/contracts/solcStandardOutput.json').toString(),
);
const standardInput = JSON.parse(
    fs.readFileSync('./build/contracts/solcStandardInput.json').toString(),
);

const generateArtifacts = (standardOutput, standardInput) => {
    const generated = [];
    mkdirp.sync('./build/artifacts');

    const sourceCodes = Object.keys(standardOutput.sources).map(
        cName => standardInput.sources[cName].content,
    );

    Object.keys(standardOutput.sources).forEach(s => {
        Object.keys(standardOutput.contracts[s]).forEach(cName => {
            const c = standardOutput.contracts[s][cName];

            if (generated.includes(cName) || !c.evm.bytecode.object) return;

            const metadata = JSON.parse(c.metadata);

            const artifact = {
                contract_name: cName,
                networks: {
                    9999: {
                        abi: c.abi,
                        solc_version: metadata.compiler.version,
                        keccak256: metadata.keccak256,
                        optimizer_enabled: metadata.settings.optimizer.enabled
                            ? metadata.settings.optimizer.runs
                            : false,
                        bytecode: '0x' + c.evm.bytecode.object,
                        runtime_bytecode: '0x' + c.evm.deployedBytecode.object,
                        updated_at: Date.now(),
                        source_map: c.evm.bytecode.sourceMap,
                        source_map_runtime: c.evm.deployedBytecode.sourceMap,
                        sources: Object.keys(standardOutput.sources),
                        sourceCodes,
                    },
                },
            };

            fs.writeFileSync(`./build/artifacts/${cName}.json`, JSON.stringify(artifact, null, 2));

            generated.push(cName);
        });
    });
};

generateArtifacts(standardOutput, standardInput);
