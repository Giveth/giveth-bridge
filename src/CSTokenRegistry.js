import { CSTokenRegistry } from './contracts';

export default class {
    constructor(web3, address) {
        this.web3 = web3;
        this.contract = new CSTokenRegistry(web3, address);
    }
}
