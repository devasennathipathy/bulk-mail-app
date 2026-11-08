import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

export async function startMongo({ persistent = false } = {}) {
  const downloadDir = fileURLToPath(new URL('../.cache/mongodb/', import.meta.url));
  const dbPath = fileURLToPath(new URL('../.data/mongodb/', import.meta.url));
  if (persistent) await mkdir(dbPath, { recursive: true });
  return MongoMemoryServer.create({
    binary: { downloadDir },
    instance: {
      dbName: 'postroom',
      storageEngine: 'wiredTiger',
      ...(persistent ? { dbPath } : {}),
    },
  });
}
