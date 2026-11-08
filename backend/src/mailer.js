import nodemailer from 'nodemailer';

export function createMailer(env = process.env) {
  const mode = env.MAIL_MODE || 'preview';
  if (!['preview', 'smtp'].includes(mode)) throw new Error('MAIL_MODE must be preview or smtp.');
  const configured =
    mode === 'preview' || Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM);
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('SMTP_PORT must be a valid port.');
  const transport =
    mode === 'preview'
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({
          host: env.SMTP_HOST,
          port,
          secure: env.SMTP_SECURE === 'true',
          requireTLS: env.SMTP_SECURE !== 'true',
          auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 20000,
        });
  return {
    mode,
    configured,
    from: env.MAIL_FROM || 'Postroom <hello@example.com>',
    async send({ email, subject, body }) {
      const info = await transport.sendMail({
        from: env.MAIL_FROM || 'Postroom <hello@example.com>',
        to: email,
        subject,
        text: body,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      if (mode === 'smtp' && !info.accepted?.length)
        throw new Error('The SMTP server did not accept this recipient.');
      return {
        email,
        status: mode === 'preview' ? 'previewed' : 'sent',
        messageId: info.messageId,
      };
    },
    close() {
      transport.close();
    },
  };
}
