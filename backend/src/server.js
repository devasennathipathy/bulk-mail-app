import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createMailer } from './mailer.js';
import { repository } from './repository.js';
import { Email } from './models/Email.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
mongoose.set('bufferCommands', false);
const mailer = createMailer();
let databaseReady = false;
let stopping = false;
let retryTimer;
const app = createApp({
  repository,
  mailer,
  isDatabaseReady: () => databaseReady,
  clientOrigin: process.env.CLIENT_ORIGIN,
});
const port = Number(process.env.PORT || 5000);
const host = process.env.HOST || '127.0.0.1';

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/postroom', {
      serverSelectionTimeoutMS: 5000,
    });
    await Email.init();
    // An interrupted process cannot safely retry email delivery automatically.
    await Email.updateMany(
      { status: 'sending' },
      { $set: { status: 'interrupted', completedAt: new Date() } },
    );
    databaseReady = true;
    console.info('MongoDB connected.');
  } catch {
    databaseReady = false;
    console.error(
      'MongoDB unavailable. Start MongoDB and check MONGODB_URI. Retrying in 10 seconds.',
    );
    if (!stopping) retryTimer = setTimeout(connectDatabase, 10000);
  }
}
mongoose.connection.on('disconnected', () => {
  databaseReady = false;
});
mongoose.connection.on('reconnected', () => {
  databaseReady = true;
});

const server = app.listen(port, host, () => {
  console.info(`Postroom API: http://${host}:${port} (${mailer.mode} mode)`);
  connectDatabase();
});
server.on('error', (error) => {
  console.error(`Server could not start: ${error.code}`);
  process.exitCode = 1;
});
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(retryTimer);
  server.close(async () => {
    mailer.close();
    await mongoose.disconnect();
  });
  setTimeout(() => process.exit(0), 25000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
