import fetch from 'node-fetch';
import { utils } from 'web3';
import logger from 'winston';

const FIVE_MINUTES = 1000 * 60 * 5;
const FIFTEEN_SECONDS = 1000 * 15;

let ethGasStationLastChecked = Date.now() - FIVE_MINUTES - 1;
let ethGasStationLastPrice = 1000000000;

let gasNowLastChecked = Date.now() - FIVE_MINUTES - 1;
let gasNowLastPrice = 1000000000;

const queryGasStation = async () => {
    if (Date.now() > ethGasStationLastChecked + FIVE_MINUTES) {
        try {
            const resp = await fetch('https://ethgasstation.info/json/ethgasAPI.json');
            if (resp.ok) {
                const { average } = await resp.json();
                ethGasStationLastPrice = utils.toWei(`${average / 10}`, 'gwei'); // response in gwei * 10
                ethGasStationLastChecked = Date.now();
            }
        } catch (e) {
            logger.error('could not fetch gas from ethgasstation', e);
        }
    }

    return ethGasStationLastPrice;
};

const queryGasNow = async () => {
    if (Date.now() > gasNowLastChecked + FIFTEEN_SECONDS) {
        try {
            const resp = await fetch('https://www.gasnow.org/api/v3/gas/price?utm_source=giveth');
            if (resp.ok) {
                const { data, code } = await resp.json();
                if (code === 200) {
                    const { standard } = data;
                    gasNowLastPrice = standard; // response in gwei
                    gasNowLastChecked = Date.now();
                } else {
                    logger.error("GasNow response wasn't OK!", resp);
                }
            }
        } catch (e) {
            logger.error('could not fetch gas from GasNow', e);
        }
    }

    return gasNowLastPrice;
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
