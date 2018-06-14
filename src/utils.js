/* istanbul ignore file */

import mailer from 'nodemailer';
import mg from 'nodemailer-mailgun-transport';
import logger from 'winston';

export const sendEmail = (config, msg) => {
    const { mailApiKey, mailDomain, mailFrom, mailTo } = config;

    if (!mailApiKey || !mailDomain || !mailFrom || !mailTo) {
        logger.info('not sending mail msg:', msg);
        return;
    }
    // Use Smtp Protocol to send Email
    var smtpTransport = mailer.createTransport(
        mg({
            auth: {
                api_key: mailApiKey,
                domain: mailDomain,
            },
        }),
    );

    var mail = {
        from: mailFrom,
        to: mailTo,
        subject: 'Giveth bridge Error',
        text: msg,
    };

    smtpTransport.sendMail(mail, function(error, response) {
        if (error) {
            console.log(error);
        }

        smtpTransport.close();
    });
};
