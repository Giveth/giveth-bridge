import rp from 'request-promise';
import { utils } from 'web3';

const FIVE_MINUTES = 1000 * 60 * 5;
const FIFTEEN_SECONDS = 1000 * 15;

let ethGasStationLastChecked = Date.now() - FIVE_MINUTES - 1;
let ethGasStationLastPrice = 1000000000;

let gasNowLastChecked = Date.now() - FIVE_MINUTES - 1;
let gasNowLastPrice = 1000000000;

const queryGasStation = () => {
    if (Date.now() > ethGasStationLastChecked + FIVE_MINUTES) {
        return rp('https://ethgasstation.info/json/ethgasAPI.json')
            .then(resp => {
                const { average } = JSON.parse(resp);
                ethGasStationLastPrice = utils.toWei(`${average / 10}`, 'gwei'); // response in gwei * 10
                ethGasStationLastChecked = Date.now();
                return ethGasStationLastPrice;
            })
            .catch(e => {
                console.error('could not fetch gas from ethgasstation', e);
                return ethGasStationLastPrice;
            });
    }

    return Promise.resolve(ethGasStationLastPrice);
};

const queryGasNow = () => {
    if (Date.now() > gasNowLastChecked + FIFTEEN_SECONDS) {
        return rp('https://www.gasnow.org/api/v3/gas/price?utm_source=giveth')
            .then(resp => {
                const { data, code } = JSON.parse(resp);
                if (code !== 200) {
                    console.error("GasNow response wasn't OK!", resp);
                    return gasNowLastPrice;
                }
                const { standard } = data;
                gasNowLastPrice = standard; // response in gwei
                gasNowLastChecked = Date.now();
                return gasNowLastPrice;
            })
            .catch(e => {
                console.error('could not fetch gas from GasNow', e);
                return gasNowLastPrice;
            });
    }

    return Promise.resolve(gasNowLastPrice);
};

export default (config, homeNetwork = true) => {
    const gasPrice = homeNetwork ? config.homeGasPrice : config.foreignGasPrice;

    if (gasPrice === 'ethGasStation') {
        return queryGasStation();
    }

    if (gasPrice === 'gasNow') {
        return queryGasNow();
    }

    return Promise.resolve(gasPrice);
};
