import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { buildConfiguration, configurationError, verifyDatabase } from '../scripts/configuration.js';
import { startMongo } from '../scripts/mongo.js';
import { createMailer } from '../src/mailer.js';

const input = {
  cluster: 'cluster0.example.mongodb.net', username: 'postroom_user',
  password: "private@pass/!()'", email: 'sender@example.com',
  smtpHost: 'smtp.gmail.com', smtpPort: '587', smtpPassword: 'abcd efgh ijkl mnop',
};

test('setup encodes reserved characters and targets the intended database and auth source', () => {
  const config = buildConfiguration(input);
  const uri = new URL(config.MONGODB_URI);
  assert.equal(decodeURIComponent(uri.password), input.password);
  assert.equal(uri.username, 'postroom_user');
  assert.equal(uri.pathname, '/postroom');
  assert.equal(uri.searchParams.get('authSource'), 'admin');
  assert.equal(uri.hostname, 'cluster0.example.mongodb.net');
  assert.equal(config.SMTP_PASS, 'abcdefghijklmnop');
  assert.equal(config.MAIL_MODE, 'smtp');
  assert.ok(!/[!'()]/.test(uri.password));
});

test('setup rejects invalid hosts and missing credentials without echoing input', () => {
  assert.throws(() => buildConfiguration({ ...input, cluster: 'attacker.example.net' }), /cluster host/);
  assert.throws(() => buildConfiguration({ ...input, password: '' }), /username and password/);
  assert.throws(() => buildConfiguration({ ...input, smtpPort: 'invalid' }), /host and port/);
  assert.throws(() => buildConfiguration({ ...input, smtpPassword: '' }), /App Password/);
  assert.throws(() => buildConfiguration({ ...input, email: 'bad\r\nBcc: a@example.com' }), /email address/);
  assert.deepEqual(Object.keys(buildConfiguration(input, { includeSmtp: false })), ['MONGODB_URI']);
});

test('provider diagnostic messages never disclose passwords or raw connection strings', () => {
  const error = Object.assign(new Error('bad auth: authentication failed: ' + input.password), { code: 8000 });
  const message = configurationError(error, 'database');
  assert.match(message, /Atlas rejected the login/);
  assert.ok(!message.includes(input.password));
  assert.match(configurationError({ code: 13 }, 'database'), /readWrite/);
  assert.match(configurationError({ code: 'EAUTH', message: input.smtpPassword }, 'smtp'), /App Password/);
  assert.ok(!configurationError(new Error(input.password), 'database').includes(input.password));
});

test('database setup verifies real MongoDB indexes and write permissions without creating campaigns', async t => {
  const mongo = await startMongo();
  t.after(() => mongo.stop());
  const uri = mongo.getUri('postroom_setup_test');
  await verifyDatabase(uri);
  const connection = await mongoose.createConnection(uri).asPromise();
  t.after(() => connection.close());
  assert.equal(await connection.collection('emails').countDocuments(), 0);
  assert.equal(await connection.collection('postroom_setup_checks').countDocuments(), 0);
  const indexes = await connection.collection('emails').indexes();
  assert.ok(indexes.some(index => index.key.requestId === 1 && index.unique));
});

test('SMTP checks authenticate without sending and infer immediate TLS for port 465', async t => {
  const original = nodemailer.createTransport;
  t.after(() => { nodemailer.createTransport = original; });
  let options, verified = 0, sent = 0;
  nodemailer.createTransport = value => {
    options = value;
    return { async verify() { verified++; return true; }, async sendMail() { sent++; }, close() {} };
  };
  const mailer = createMailer({ MAIL_MODE: 'smtp', SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465',
    SMTP_USER: 'sender@example.com', SMTP_PASS: 'test-only-password', MAIL_FROM: 'sender@example.com' });
  await mailer.verify();
  assert.equal(options.secure, true);
  assert.equal(options.requireTLS, false);
  assert.equal(verified, 1);
  assert.equal(sent, 0);
  mailer.close();
  createMailer({ MAIL_MODE: 'smtp', SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587' });
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
});
