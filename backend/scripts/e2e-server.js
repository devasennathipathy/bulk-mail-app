import mongoose from 'mongoose';
import { startMongo } from './mongo.js';
import { createApp } from '../src/app.js';
import { createMailer } from '../src/mailer.js';
import { repository } from '../src/repository.js';
import { Email } from '../src/models/Email.js';

const mongo = await startMongo();
await mongoose.connect(mongo.getUri('postroom_browser_test'));
await Email.init();
const mailer = createMailer({ MAIL_MODE: 'preview' });
const app = createApp({ repository, mailer, isDatabaseReady: () => true });
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
