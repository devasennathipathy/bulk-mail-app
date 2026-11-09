import express from 'express';
import { createApp } from './app.js';
import { createDatabaseConnection } from './database.js';
import { createMailer } from './mailer.js';
import { repository } from './repository.js';

export function createHostedApp({
  app = express(),
  env = process.env,
  database = createDatabaseConnection({ uri: env.MONGODB_URI }),
  mailer = createMailer(env),
  logger = console,
} = {}) {
  app.disable('x-powered-by');
  app.use('/api', async (_req, _res, next) => {
    try {
      await database.connect();
    } catch (error) {
      // Health still responds, and database-dependent routes return a useful 503.
      logger.error('Hosted database connection unavailable', {
        name: error.name,
        code: Number.isInteger(error.code) ? error.code : undefined,
        codeName: error.codeName,
      });
    }
    next();
  });
  app.use(
    createApp({
      repository,
      mailer,
      isDatabaseReady: () => database.isReady(),
      clientOrigin: env.CLIENT_ORIGIN,
      logger,
      serveFrontend: false,
      trustProxy: 1,
    }),
  );
  return app;
}
