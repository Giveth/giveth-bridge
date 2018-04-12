import env from 'node-env-file';
import path from 'path';

env(path.join(__dirname, '/.env'), { overwrite: true });
env(path.join(__dirname, '/.env.local'), { overwrite: true, raise: false });

const {
  ENVIRONMENT = 'localhost', // optional
  HOME_NODE_URL,
  HOME_BRIDGE,
  HOME_BRIDGE_DEPLOY_BLOCK = 0,
  HOME_REQUIRED_CONFIRMATIONS = 12,
  FOREIGN_NODE_URL,
  FOREIGN_BRIDGE,
  FOREIGN_BRIDGE_DEPLOY_BLOCK = 0,
  FOREIGN_REQUIRED_CONFIRMATIONS = 24,
  POLL_TIME = 60 * 5 // 5 mins
} = process.env;

const configurations = {
  localhost: {
    homeNodeUrl: 'http://localhost:8545',
    homeBridge: '0x',
    foreignNodeUrl: 'http://localhost:7545',
    foreignBridge: '0x'
  },
  develop: {
    homeNodeUrl: '',
    homeBridge: '0x',
    foreignNodeUrl: '',
    foreignBridge: '0x'
  },
  alpha: {
    homeNodeUrl: '',
    homeBridge: '0x',
    foreignNodeUrl: '',
    foreignBridge: '0x'
  },
};

// Unknown environment
if (configurations[ENVIRONMENT] === undefined)
  throw new Error(
    `There is no configuration object for environment: ${ENVIRONMENT}. Expected ENVIRONMENT to be empty or one of: ${Object.keys(
      configurations,
    )}`,
  );

// Create config object based on environment setup
const config = Object.assign({}, configurations[ENVIRONMENT]);

// Overwrite the environment values with parameters
config.homeNodeUrl = HOME_NODE_URL || config.homeNodeUrl;
config.homeBridge = HOME_BRIDGE || config.homeBridge;
config.homeBridgeDeployBlock = HOME_BRIDGE_DEPLOY_BLOCK || config.homeBridgeDeployBlock;
config.homeRequiredConfirmations = HOME_REQUIRED_CONFIRMATIONS;
config.foreignNodeUrl = FOREIGN_NODE_URL || config.foreignNodeUrl;
config.foreignBridge = FOREIGN_BRIDGE || config.foreignBridge;
config.foreignBridgeDeployBlock = FOREIGN_BRIDGE_DEPLOY_BLOCK || config.foreignBridgeDeployBlock;
config.foreignRequiredConfirmations = FOREIGN_REQUIRED_CONFIRMATIONS;
config.pollTime = POLL_TIME || config.pollTime;

export default config;