////////////////
// note: do not import this file directly. The config should be passed around within
// the app. This allows the bridge to be run as a dependency in feathers-giveth
// This file should only be imported in files that call bridge(config);
///////////////

import {existsSync, readFileSync} from 'fs';
import {join} from 'path';

let {ENVIRONMENT, NODE_ENV} = process.env;

if (!ENVIRONMENT && NODE_ENV) ENVIRONMENT = NODE_ENV;
/* istanbul ignore next */
if (!ENVIRONMENT) ENVIRONMENT = 'local';

const config = JSON.parse(readFileSync(join(__dirname, '../config/default.json'),  'utf-8'));

if (ENVIRONMENT && existsSync(join(__dirname, `../config/${ENVIRONMENT}.json`))) {
    const localConfig = JSON.parse(
        readFileSync(join(__dirname, `../config/${ENVIRONMENT}.json`),  'utf-8'),
    );
    Object.assign(config, localConfig);
}

export default config;
