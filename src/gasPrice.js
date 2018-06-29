import rp from 'request-promise';
import { utils } from 'web3';

const FIVE_MINUTES = 1000 * 60 * 5;

let lastChecked = Date.now() - FIVE_MINUTES - 1;
let lastPrice = 1000000000;

const queryGasStation = () => {
    if (Date.now() > lastChecked + FIVE_MINUTES) {
        return rp('https://ethgasstation.info/json/ethgasAPI.json')
            .then(resp => {
                const { average } = JSON.parse(resp);
                lastPrice = utils.toWei(`${average / 10}`, 'gwei'); // response in gwei * 10
                lastChecked = Date.now();
                return lastPrice;
            })
            .catch(e => {
                console.error('could not fetch gas from ethgasstation', e);
                return lastPrice;
            });
    }

    return Promise.resolve(lastPrice);
};

export default (config, homeNetwork = true) => {
    const gasPrice = homeNetwork ? config.homeGasPrice : config.foreignGasPrice;

    if (gasPrice === 'ethGasStation') {
        return queryGasStation();
    }

    return Promise.resolve(gasPrice);
};
