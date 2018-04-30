import fs from 'fs';
import path from 'path';

let { ENVIRONMENT, NODE_ENV } = process.env;

if (!ENVIRONMENT && NODE_ENV) ENVIRONMENT = NODE_ENV;
/* istanbul ignore next */
if (!ENVIRONMENT) ENVIRONMENT = 'local';

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/default.json')));

if (ENVIRONMENT && fs.existsSync(path.join(__dirname, `../config/${ENVIRONMENT}.json`))) {
    const localConfig = JSON.parse(
        fs.readFileSync(path.join(__dirname, `../config/${ENVIRONMENT}.json`)),
    );
    Object.assign(config, localConfig);
}

export default config;
