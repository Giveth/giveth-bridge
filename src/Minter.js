import { Minter } from './contracts';

export default class {
    constructor(web3, address) {
        this.web3 = web3;
        this.minter = new Minter(web3, address);
    }
}
