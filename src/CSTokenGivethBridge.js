import { CSTokenGivethBridge } from './contracts';

export default class {
    constructor(web3, address) {
        this.web3 = web3;
        this.bridge = new CSTokenGivethBridge(web3, address);
    }
}
