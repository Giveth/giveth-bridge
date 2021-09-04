import semaphore from 'semaphore';
import * as Sentry from '@sentry/node';
import logger from 'winston';

export default class {
    constructor(initialHomeNonce, initialForeignNonce) {
        this.homeNonce = Number(initialHomeNonce);
        this.foreignNonce = Number(initialForeignNonce);
        this.homeSem = semaphore();
        this.foreignSem = semaphore();
    }

    obtainNonce(isHomeTx = false) {
        logger.debug('Obtaining nonce isHomeTx: ', isHomeTx);

        let nonceTaken = false;
        const transaction = Sentry.startTransaction({
            op: 'obtainNonce',
            tags: {
                isHomeTx,
            },
        });

        setTimeout(() => {
            if (!nonceTaken) {
                Sentry.captureMessage(
                    'Could not obtaion nonce after 5 seconds',
                    Sentry.Severity.Critical,
                );
                transaction.finish();
            }
        }, 5000);

        const sem = isHomeTx ? this.homeSem : this.foreignSem;

        return new Promise(resolve => {
            sem.take(() => {
                const n = isHomeTx ? this.homeNonce++ : this.foreignNonce++;
                logger.debug('Giving nonce isHomeTx:', isHomeTx, 'nonce:', n);
                nonceTaken = true;
                transaction.finish();
                resolve(n);
            });
        });
    }

    releaseNonce(nonce, isHomeTx = false, broadcasted = true) {
        logger.debug('Releasing nonce:', nonce, 'isHomeTx:', isHomeTx, 'broadcasted:', broadcasted);
        const n = isHomeTx ? this.homeNonce : this.foreignNonce;

        // n is returned and then incremented
        if (nonce + 1 !== n) {
            throw new Error(
                'attempting to release nonce, but the provided nonce should not have a lock',
            );
        }

        if (isHomeTx) {
            if (!broadcasted) this.homeNonce--;
            this.homeSem.leave();
        } else {
            if (!broadcasted) this.foreignNonce--;
            this.foreignSem.leave();
        }
    }
}
