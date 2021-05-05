/* istanbul ignore file */

import mailgun from 'mailgun-js';
import logger from 'winston';

// eslint-disable-next-line import/prefer-default-export
export const sendEmail = (config, msg) => {
    const { mailApiKey, mailDomain, mailFrom, mailTo } = config;

    if (!mailApiKey || !mailDomain || !mailFrom || !mailTo) {
        logger.info('not sending mail msg:', msg);
        return;
    }
    const mg = mailgun({ apiKey: mailApiKey, domain: mailDomain });

    const send = address => {
        const mail = {
            from: mailFrom,
            to: address,
            subject: 'Giveth bridge Error',
            text: msg,
        };

        mg.messages().send(mail, (error, _) => {
            if (error) {
                // eslint-disable-next-line no-console
                logger.error(error);
            }
        });
    };

    if (Array.isArray(mailTo)) {
        mailTo.map(send);
    } else {
        send(mailTo);
    }
};
