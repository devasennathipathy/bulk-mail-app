import mongoose from 'mongoose';
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startMongo } from './mongo.js';
import { createHostedApp } from '../src/hosted-app.js';
import { createMailer } from '../src/mailer.js';
import { Email } from '../src/models/Email.js';

const mongo = await startMongo();
await mongoose.connect(mongo.getUri('postroom_browser_test'));
await Email.init();
const mailer = createMailer({ MAIL_MODE: 'preview' });
const app = express();
// Simulate Vercel's same-origin service routing: /api uses the hosted backend,
// while the frontend build is served separately by the outer test server.
app.use(
  createHostedApp({
    env: { MONGODB_URI: mongo.getUri('postroom_browser_test'), MAIL_MODE: 'preview' },
    mailer,
  }),
);
const distPath = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
app.use(express.static(distPath));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
const server = app.listen(5100, '127.0.0.1', () =>
  console.info('Browser test server ready at http://127.0.0.1:5100'),
);
async function stop() {
  server.closeAllConnections();
  server.close();
  mailer.close();
  await mongoose.disconnect();
  await mongo.stop();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
