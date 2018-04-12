import logger from 'winston';
import Datastore from 'nedb';
import path from 'path';
import { Relayer } from './Relayer';

import config from './configuration';

export default () => {
  const db = {};
  db.bridge = new Datastore(path.join(__dirname, '/data/bridge-data.db'))
  db.bridge.loadDatabase();
  db.txs = new Datastore(path.join(__dirname, '/data/bridge-txs.db'))
  db.txs.loadDatabase();

  relayer = new Relayer(config, db);

  relayer.loadBridgeData()
    .then(bridgeData => {
      if (bridgeData.homeContractAddress !== config.homeBridge) {
        throw new Error("stored homeBridge address does not match config.homeBridge");
      }
      if (bridgeData.foreignContractAddress !== config.foreignBridge) {
        throw new Error("stored foreignBridge address does not match config.foreignBridge");
      }
      relayer.start();
    })
}