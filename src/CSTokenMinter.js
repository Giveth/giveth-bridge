import { CSTokenMinter } from './contracts';

export default class {
    constructor(web3, address) {
        this.web3 = web3;
        this.minter = new CSTokenMinter(web3, address);
    }
}
