/// <reference path="./types.ts"/>

import * as Sentry from "@sentry/node";
import {INonceTracker, NonceTrackerDependencies, NetworkAddress} from "./types";

export class NonceTracker implements INonceTracker {
    private currentVal: number;
    private readonly info: string;

    constructor(private readonly address: NetworkAddress,
                startFrom: number,
                private readonly deps: NonceTrackerDependencies) {

        this.currentVal = startFrom;
        this.info = `Network: ${this.address.networkName}, Address: ${this.address}`
    }

    getNonce(): Promise<number> {

        this.deps.logger.debug('Obtaining nonce for', this.info);

        let nonceTaken = false;

        setTimeout(() => {
            if (!nonceTaken) {
                const transaction = Sentry.startTransaction({
                    name: 'getting nonce',
                    op: 'obtainNonce',
                    tags: {
                        info: this.info,
                    },
                });
                Sentry.captureMessage(
                    'Could not obtain nonce after 5 seconds',
                    Sentry.Severity.Critical,
                );
                transaction.finish();
            }
        }, 5000);

        return new Promise(resolve => {
            this.deps.semaphore.take(() => {
                this.currentVal++;
                this.deps.logger.debug('Giving nonce for', this.info);
                nonceTaken = true;
                resolve(this.currentVal)
            });
        });
    }

    releaseNonce(nonce: number, broadcasted = true): void {
        this.deps.logger.debug('Releasing nonce:', nonce, this.info, 'broadcasted:', broadcasted);
        const n = this.currentVal

        // n is returned and then incremented
        if (nonce + 1 !== n) {
            throw new Error(
                'attempting to release nonce, but the provided nonce should not have a lock',
            );
        }

        if (!broadcasted) {
            this.currentVal--;
            this.deps.semaphore.leave();
        }
    }
}
