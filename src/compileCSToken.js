const path = require('path')
const fs = require('fs');
const solc = require('solc');

const soliditySourceFileName = 'CSTokenGivethBridge.sol';
const csTokeContractPath = path.resolve(__dirname, '..', 'contracts-new', soliditySourceFileName);
const source = fs.readFileSync(csTokeContractPath, 'UTF-8');
const sources = {};
sources[soliditySourceFileName] = {
    content: source,
}

const input = {
    language: 'Solidity',
    sources,
    settings: {
        outputSelection: {
            '*': {
                '*': ['*']
            }
        }
    }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const contract = output.contracts[soliditySourceFileName];
for (const [key, compilerOutput]  of Object.entries(contract)) {
    const artifactPath = path.resolve(__dirname, '..', 'build', `${key}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify({
        contractName: key,
        compilerOutput,
    }, null, 2));
}

