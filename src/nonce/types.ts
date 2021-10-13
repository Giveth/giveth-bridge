import {Winston} from "winston";
import {Semaphore} from "semaphore";

export interface INonceTracker {
    getNonce(): Promise<number>;
    releaseNonce(nonce: number, broadcasted: boolean): void
}

export type NonceTrackerDependencies = {
    logger: Winston
    semaphore: Semaphore
}

export type NetworkType =
    | 'rinkeby'
    | 'eth-main'
    | 'ropsten';

export type NetworkAddress = {
    networkName: NetworkType
    address: string
}
