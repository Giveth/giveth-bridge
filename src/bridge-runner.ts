import * as Sentry from '@sentry/node';
import bridge from './bridge-new';
import config from './configuration-new';

Sentry.init({
    dsn: config.sentryDsn,
    environment: process.env.NODE_ENV,
    serverName: `Giveth Bridge ${config.bridgeName}`,
    release: `Giveth-Bridge@${process.env.npm_package_version}`,
    // we want to capture 100% of errors
    sampleRate: 1,

    /**
     * @see{@link   https://docs.sentry.io/platforms/node/configuration/sampling/#setting-a-uniform-sample-rate}
     */
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // But we recommend adjusting this value in production
    tracesSampleRate: 1,
});

bridge(config);
