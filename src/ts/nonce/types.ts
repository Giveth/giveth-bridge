import {Winston} from "winston";
import {Semaphore} from "semaphore";

export interface INonceTracker {
    getNonce(): Promise<number>;
}

export type NonceTrackerDependencies = {
    logger: Winston
    semaphore: Semaphore
}

export type NetworkType =
    | 'rinkeby'
    | 'eth-main';

export type NetworkAddress = {
    networkName: NetworkType
    address: string
}
