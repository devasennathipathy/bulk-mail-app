import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createMailer } from '../src/mailer.js';
import { Email } from '../src/models/Email.js';

function encodeCredential(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function buildConfiguration(input, { includeSmtp = true } = {}) {
  const host = String(input.cluster || '').trim().toLowerCase();
  const username = String(input.username || '').trim();
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.mongodb\.net$/.test(host))
    throw new Error('Enter your Atlas cluster host, such as cluster0.rtvbsl1.mongodb.net.');
  if (!username || !password || /[\r\n\0]/.test(username + password))
    throw new Error('Enter your Atlas database username and password.');
  const values = {
    MONGODB_URI: `mongodb+srv://${encodeCredential(username)}:${encodeCredential(password)}@${host}/postroom?retryWrites=true&w=majority&authSource=admin`,
  };
  if (!includeSmtp) return values;
  const email = String(input.email || '').trim();
  const smtpHost = String(input.smtpHost || 'smtp.gmail.com').trim().toLowerCase();
  const smtpPort = Number(input.smtpPort || 587);
  const smtpPassword = typeof input.smtpPassword === 'string' ? input.smtpPassword : '';
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))
    throw new Error('Enter the full email address for your sender account.');
  if (!/^[a-z0-9.-]+$/.test(smtpHost) || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)
    throw new Error('Check your SMTP host and port.');
  if (!smtpPassword || /[\r\n\0]/.test(smtpPassword))
    throw new Error('Enter the SMTP password or App Password from your email provider.');
  return {
    ...values,
    SMTP_HOST: smtpHost,
    SMTP_PORT: String(smtpPort),
    SMTP_SECURE: String(smtpPort === 465),
    SMTP_USER: email,
    SMTP_PASS: smtpHost === 'smtp.gmail.com' ? smtpPassword.replace(/\s+/g, '') : smtpPassword,
    MAIL_FROM: email,
    MAIL_MODE: 'smtp',
  };
}

// Provider errors can contain credentials. Only return fixed, useful descriptions.
export function configurationError(error, service) {
  if (service === 'database') {
    if (/bad auth|authentication failed|unable to authenticate/i.test(error.message || ''))
      return 'Atlas rejected the login. Reset the password for this exact database user, save it in Atlas, then enter the new password here.';
    if (error.code === 13)
      return 'This database user needs the readWrite role on the postroom database.';
    return 'Cannot connect to Atlas. Check the cluster host, cluster availability, and IP access list.';
  }
  if (error.code === 'EAUTH')
    return 'SMTP login failed. For Gmail, use an App Password from your Google account.';
  return 'Cannot verify SMTP. Check your email provider, host, port, and account settings.';
}

export async function verifyDatabase(uri) {
  const connection = mongoose.createConnection(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 2 });
  try {
    await connection.asPromise();
    await connection.model('Email', Email.schema).init();
    // Verify write permission without leaving an email campaign or sending a message.
    const collection = connection.collection('postroom_setup_checks');
    const id = randomUUID();
    await collection.insertOne({ _id: id, createdAt: new Date() });
    await collection.deleteOne({ _id: id });
  } catch (error) {
    throw new Error(configurationError(error, 'database'));
  } finally {
    await connection.close().catch(() => {});
  }
}

export async function verifySmtp(values) {
  const mailer = createMailer(values);
  try { await mailer.verify(); }
  catch (error) { throw new Error(configurationError(error, 'smtp')); }
  finally { mailer.close(); }
}
