const bridge = require('./lib/bridge').default;
const { GivethBridge, ForeignGivethBridge } = require('./lib/contracts');

module.exports = {
    GivethBridge,
    ForeignGivethBridge,
    bridge,
};
