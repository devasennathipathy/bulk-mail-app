import mongoose from 'mongoose';
import { Email } from './models/Email.js';

export function createDatabaseConnection({
  uri,
  client = mongoose,
  initialize = () => Email.init(),
} = {}) {
  let pending = null;
  let initialized = false;

  return {
    isReady() {
      return initialized && client.connection.readyState === 1;
    },
    async connect() {
      if (!uri) throw new Error('MONGODB_URI is not configured.');
      if (pending) return pending;
      if (initialized && client.connection.readyState === 1) return client;
      pending = (async () => {
        // One small connection pool per warm function instance, shared by concurrent requests.
        await client.connect(uri, {
          bufferCommands: false,
          maxPoolSize: 5,
          minPoolSize: 0,
          maxIdleTimeMS: 60000,
          serverSelectionTimeoutMS: 5000,
        });
        await initialize();
        initialized = true;
        return client;
      })();
      try {
        return await pending;
      } catch (error) {
        initialized = false;
        throw error;
      } finally {
        pending = null;
      }
    },
  };
}
