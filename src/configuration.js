import fs from 'fs';
import path from 'path';

const { ENVIRONMENT = 'local' } = process.env;

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/default.json')));

if (ENVIRONMENT && fs.existsSync(path.join(__dirname, `../config/${ENVIRONMENT}.json`))) {
  const localConfig = JSON.parse(fs.readFileSync(path.join(__dirname, `../config/${ENVIRONMENT}.json`)));
  Object.assign(config, localConfig);
}

export default config;