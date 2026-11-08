import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { startMongo } from '../scripts/mongo.js';
import { createApp } from '../src/app.js';
import { createMailer } from '../src/mailer.js';
import { repository } from '../src/repository.js';
import { Email } from '../src/models/Email.js';

let mongo;
const logger = { info() {}, error() {} };
before(
  async () => {
    mongo = await startMongo();
    await mongoose.connect(mongo.getUri('postroom_api_test'));
    await Email.init();
  },
  { timeout: 240000 },
);
beforeEach(async () => {
  await Email.deleteMany({});
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

function payload(overrides = {}) {
  return {
    subject: 'A little hello',
    body: 'Hi there,\nThanks for joining us.',
    recipients: ['alex@example.com', 'sam@example.com'],
    requestId: randomUUID(),
    ...overrides,
  };
}
async function fixture(t, overrides = {}) {
  const mailer = overrides.mailer || createMailer({ MAIL_MODE: 'preview' });
  const app = createApp({
    repository,
    mailer,
    isDatabaseReady: () => true,
    logger,
    rateLimitEnabled: false,
    ...overrides,
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    mailer.close?.();
  });
  return async (path, body, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...options,
    });
    return { status: response.status, data: await response.json() };
  };
}

test('preview uses Nodemailer and persists a normalized campaign and recipient outcomes in MongoDB', async (t) => {
  const call = await fixture(t);
  const result = await call(
    '/emails',
    payload({
      subject: '  Welcome!  ',
      recipients: ['Alex@Example.com', 'alex@example.com', 'sam@example.com'],
    }),
  );
  assert.equal(result.status, 201);
  assert.equal(result.data.record.status, 'previewed');
  assert.equal(result.data.record.subject, 'Welcome!');
  assert.deepEqual(result.data.record.recipients, ['alex@example.com', 'sam@example.com']);
  assert.equal(result.data.record.sentCount, 0);
  assert.equal(result.data.record.deliveries.length, 2);
  assert.ok(
    result.data.record.deliveries.every((item) => item.status === 'previewed' && item.messageId),
  );
  assert.equal(await Email.countDocuments(), 1);
  const stats = await call('/stats');
  assert.equal(stats.data.previewed, 2);
  assert.equal(stats.data.sent, 0);
});

test('invalid, empty, oversized, and header-injection requests are rejected before persistence or sending', async (t) => {
  const call = await fixture(t);
  const invalid = [
    {},
    null,
    payload({ recipients: ['not-an-email'] }),
    payload({ recipients: [] }),
    payload({ recipients: [null] }),
    payload({ subject: 'Hello\r\nBcc: victim@example.com' }),
    payload({ subject: 'a'.repeat(201) }),
    payload({ body: ' ' }),
    payload({ body: 'a'.repeat(50001) }),
    payload({ requestId: 'invalid' }),
    payload({ recipients: Array.from({ length: 101 }, (_, i) => `person${i}@example.com`) }),
  ];
  for (const input of invalid) assert.equal((await call('/emails', input)).status, 400);
  assert.equal(await Email.countDocuments(), 0);
});

test('database outage exposes health but blocks send and history', async (t) => {
  const call = await fixture(t, { isDatabaseReady: () => false });
  const health = await call('/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.database, 'disconnected');
  assert.equal((await call('/emails', payload())).status, 503);
  assert.equal((await call('/emails')).status, 503);
});

test('SMTP credentials are required in real sending mode', async (t) => {
  const call = await fixture(t, { mailer: createMailer({ MAIL_MODE: 'smtp' }) });
  assert.equal((await call('/emails', payload())).status, 503);
  assert.equal(await Email.countDocuments(), 0);
  const health = await call('/health');
  assert.equal(health.data.mail.configured, false);
  assert.ok(!JSON.stringify(health).includes('SMTP_PASS'));
});

test('SMTP outcomes are tracked individually and partial failures are not reported as success', async (t) => {
  const messages = [];
  const mailer = {
    mode: 'smtp',
    configured: true,
    from: 'team@example.com',
    async send(message) {
      messages.push(message);
      if (message.email === 'sam@example.com')
        throw Object.assign(new Error('private SMTP password'), { code: 'EAUTH' });
      return { email: message.email, status: 'sent', messageId: randomUUID() };
    },
  };
  const call = await fixture(t, { mailer });
  const result = await call('/emails', payload());
  assert.equal(result.data.record.status, 'partial');
  assert.equal(result.data.record.sentCount, 1);
  assert.equal(result.data.record.failedCount, 1);
  assert.ok(messages.every((message) => !message.recipients && typeof message.email === 'string'));
  assert.ok(!JSON.stringify(result.data).includes('private SMTP password'));
  const stats = await call('/stats');
  assert.equal(stats.data.sent, 1);
  assert.equal(stats.data.failed, 1);
});

test('all-rejected SMTP campaigns have failed status', async (t) => {
  const call = await fixture(t, {
    mailer: {
      mode: 'smtp',
      configured: true,
      async send() {
        throw Object.assign(new Error('rejected'), { responseCode: 550 });
      },
    },
  });
  const { data } = await call('/emails', payload());
  assert.equal(data.record.status, 'failed');
  assert.equal(data.record.failedCount, 2);
  assert.equal(data.record.sentCount, 0);
});

test('concurrent and repeated requests with one request ID do not send duplicate emails', async (t) => {
  let sends = 0;
  const call = await fixture(t, {
    mailer: {
      mode: 'smtp',
      configured: true,
      async send({ email }) {
        sends++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { email, status: 'sent' };
      },
    },
  });
  const input = payload();
  const results = await Promise.all([call('/emails', input), call('/emails', input)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
  assert.equal((await call('/emails', input)).status, 200);
  assert.equal(sends, 2);
  assert.equal(await Email.countDocuments(), 1);
  assert.equal((await call('/emails', { ...input, subject: 'Changed message' })).status, 409);
});

test('history supports literal search, pagination, status filtering, and full record details', async (t) => {
  const call = await fixture(t);
  const first = await call('/emails', payload({ subject: 'Welcome [team]' }));
  await call('/emails', payload({ subject: 'A second campaign' }));
  const page = await call('/emails?limit=1&page=1');
  assert.equal(page.data.records.length, 1);
  assert.equal(page.data.total, 2);
  assert.equal(page.data.pages, 2);
  assert.equal(page.data.records[0].body, undefined);
  assert.equal((await call('/emails?search=%5Bteam%5D&status=previewed')).data.total, 1);
  assert.equal((await call('/emails?status=sent')).data.total, 0);
  const detail = await call(`/emails/${first.data.record._id}`);
  assert.equal(detail.data.body, payload().body);
  assert.equal(detail.data.deliveries.length, 2);
  assert.equal((await call('/emails/invalid')).status, 400);
  assert.equal((await call('/emails/aaaaaaaaaaaaaaaaaaaaaaaa')).status, 404);
  assert.equal((await call('/emails?page=-1')).status, 400);
  assert.equal((await call('/emails?status=invalid')).status, 400);
});

test('a failed initial MongoDB write prevents any SMTP delivery', async (t) => {
  let sends = 0;
  const call = await fixture(t, {
    repository: {
      ...repository,
      async create() {
        throw new Error('database write failed');
      },
    },
    mailer: {
      mode: 'smtp',
      configured: true,
      async send() {
        sends++;
      },
    },
  });
  assert.equal((await call('/emails', payload())).status, 500);
  assert.equal(sends, 0);
});

test('malformed JSON and unknown API routes return useful JSON errors', async (t) => {
  const call = await fixture(t);
  assert.equal((await call('/emails', {}, { body: '{' })).status, 400);
  assert.equal((await call('/unknown')).status, 404);
});

test('bulk campaigns limit simultaneous SMTP connections and save every recipient result', async (t) => {
  let active = 0;
  let peak = 0;
  const call = await fixture(t, {
    mailer: {
      mode: 'smtp',
      configured: true,
      async send({ email }) {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
        return { email, status: 'sent' };
      },
    },
  });
  const recipients = Array.from({ length: 11 }, (_, i) => `person${i}@example.com`);
  const { data } = await call('/emails', payload({ recipients }));
  assert.equal(data.record.status, 'sent');
  assert.equal(data.record.sentCount, 11);
  assert.equal(data.record.deliveries.length, 11);
  assert.equal(peak, 3);
});

test('a progress write failure stops scheduling emails and marks the campaign interrupted', async (t) => {
  let sends = 0;
  const call = await fixture(t, {
    repository: {
      ...repository,
      async addDelivery() {
        throw new Error('write unavailable');
      },
    },
    mailer: {
      mode: 'smtp',
      configured: true,
      async send({ email }) {
        sends++;
        return { email, status: 'sent' };
      },
    },
  });
  const input = payload({
    recipients: Array.from({ length: 11 }, (_, i) => `person${i}@example.com`),
  });
  const response = await call('/emails', input);
  assert.equal(response.status, 503);
  assert.equal(sends, 3);
  assert.equal((await Email.findOne()).status, 'interrupted');
  assert.equal((await call('/emails', input)).data.record.status, 'interrupted');
  assert.equal(sends, 3);
});

test('send rate limiting rejects excessive requests', async (t) => {
  const call = await fixture(t, { rateLimitEnabled: true });
  for (let i = 0; i < 10; i++) assert.equal((await call('/emails', {})).status, 400);
  assert.equal((await call('/emails', {})).status, 429);
});
