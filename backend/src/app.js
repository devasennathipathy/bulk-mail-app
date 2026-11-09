import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MAX_RECIPIENTS, STATUSES, validateEmail } from './validation.js';

function publicDeliveryError(error) {
  if (error.code === 'EAUTH') return 'SMTP authentication failed. Check the sender credentials.';
  if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'EDNS'].includes(error.code))
    return 'Could not connect to the SMTP server.';
  if (error.responseCode >= 500) return 'The SMTP server rejected this email.';
  return 'Email delivery failed. Check the SMTP settings and server logs.';
}

export function createApp({
  repository,
  mailer,
  isDatabaseReady,
  clientOrigin = 'http://localhost:5173',
  logger = console,
  rateLimitEnabled = true,
  serveFrontend = true,
  trustProxy = false,
}) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', trustProxy);
  app.use(helmet());
  app.use(cors({ origin: clientOrigin }));
  app.use(express.json({ limit: '128kb' }));

  app.get('/api/health', (_req, res) =>
    res.json({
      database: isDatabaseReady() ? 'connected' : 'disconnected',
      mail: { mode: mailer.mode, configured: mailer.configured, from: mailer.from },
      maxRecipients: MAX_RECIPIENTS,
    }),
  );

  app.use('/api', (_req, res, next) => {
    if (!isDatabaseReady())
      return res.status(503).json({
        message:
          'MongoDB is not connected. Check MONGODB_URI and database network access in your backend environment settings (backend/.env when running locally).',
      });
    next();
  });

  app.get('/api/stats', async (_req, res) => res.json(await repository.stats()));
  app.get('/api/emails', async (req, res) => {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (req.query.status && !STATUSES.includes(req.query.status)) ||
      (req.query.search && typeof req.query.search !== 'string')
    ) {
      return res.status(400).json({ message: 'Invalid history filters.' });
    }
    res.json(
      await repository.list({
        page,
        limit,
        status: req.query.status,
        search: (req.query.search || '').trim().slice(0, 200),
      }),
    );
  });

  app.get('/api/emails/:id', async (req, res) => {
    if (!/^[a-f\d]{24}$/i.test(req.params.id))
      return res.status(400).json({ message: 'Invalid email record ID.' });
    const email = await repository.findById(req.params.id);
    if (!email) return res.status(404).json({ message: 'Email record not found.' });
    res.json(email);
  });

  const sendLimit = rateLimit({
    windowMs: 60000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Too many send requests. Please wait a minute.' },
  });
  app.post('/api/emails', ...(rateLimitEnabled ? [sendLimit] : []), async (req, res) => {
    const { data, errors } = validateEmail(req.body);
    if (Object.keys(errors).length)
      return res.status(400).json({ message: 'Please check the email fields.', errors });
    if (!mailer.configured)
      return res.status(503).json({
        message:
          'SMTP is not configured. Add SMTP settings to backend/.env or use MAIL_MODE=preview.',
      });
    let record;
    try {
      record = await repository.create({ ...data, status: 'sending', mode: mailer.mode });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await repository.findByRequestId(data.requestId);
      if (
        !existing ||
        existing.subject !== data.subject ||
        existing.body !== data.body ||
        JSON.stringify(existing.recipients) !== JSON.stringify(data.recipients)
      ) {
        return res.status(409).json({ message: 'This request ID belongs to a different email.' });
      }
      return res
        .status(200)
        .json({ message: 'This email request is already recorded.', record: existing });
    }

    let cursor = 0;
    let failed = 0;
    let persistenceFailed = false;
    // Separate messages keep recipients private. Bounded concurrency respects SMTP limits.
    async function deliver() {
      while (!persistenceFailed && cursor < data.recipients.length) {
        const email = data.recipients[cursor++];
        let delivery;
        try {
          delivery = await mailer.send({ email, subject: data.subject, body: data.body });
        } catch (error) {
          failed++;
          delivery = { email, status: 'failed', error: publicDeliveryError(error) };
          logger.error('SMTP delivery failed', {
            recordId: String(record._id),
            code: error.code || 'UNKNOWN',
            responseCode: error.responseCode,
          });
        }
        try {
          await repository.addDelivery(record._id, delivery);
        } catch (error) {
          persistenceFailed = true;
          throw error;
        }
      }
    }
    // Let every active worker settle before handling a database write failure.
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(3, data.recipients.length) }, deliver),
    );
    if (results.some((result) => result.status === 'rejected')) {
      logger.error('Delivery progress could not be saved', { recordId: String(record._id) });
      try {
        await repository.finish(record._id, 'interrupted');
      } catch {
        // Startup recovery marks this record interrupted if the database is still unavailable.
      }
      return res.status(503).json({
        message:
          'Some email delivery results could not be saved. Check history before sending again.',
        recordId: String(record._id),
      });
    }
    const status =
      failed === data.recipients.length
        ? 'failed'
        : failed
          ? 'partial'
          : mailer.mode === 'preview'
            ? 'previewed'
            : 'sent';
    const completed = await repository.finish(record._id, status);
    logger.info('Email request completed', {
      recordId: String(record._id),
      status,
      recipients: data.recipients.length,
    });
    res.status(201).json({
      message:
        status === 'previewed'
          ? 'Preview saved. No real emails were sent.'
          : status === 'sent'
            ? 'All emails were accepted by the SMTP server.'
            : 'Delivery completed with failures. See history for details.',
      record: completed,
    });
  });

  app.use('/api', (_req, res) => res.status(404).json({ message: 'API endpoint not found.' }));
  const distPath = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  if (serveFrontend && existsSync(path.join(distPath, 'index.html'))) {
    app.use(express.static(distPath));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ message: 'Request body must be valid JSON.' });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ message: 'The email request is too large.' });
    logger.error('API request failed', { name: error.name, code: error.code });
    res.status(500).json({
      message: 'The request could not be completed. Check history before retrying a send.',
    });
  });
  return app;
}
