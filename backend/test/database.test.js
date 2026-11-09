import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseConnection } from '../src/database.js';

test('concurrent cold-start requests share one connection and initialize indexes before becoming ready', async () => {
  let connections = 0;
  let initializations = 0;
  const client = {
    connection: { readyState: 0 },
    async connect(_uri, options) {
      connections++;
      assert.equal(options.maxPoolSize, 5);
      await new Promise((resolve) => setTimeout(resolve, 10));
      client.connection.readyState = 1;
      return client;
    },
  };
  const database = createDatabaseConnection({
    uri: 'mongodb://test-host/postroom',
    client,
    async initialize() {
      assert.equal(database.isReady(), false);
      initializations++;
    },
  });
  assert.equal(database.isReady(), false);
  await Promise.all([database.connect(), database.connect(), database.connect()]);
  await database.connect();
  assert.equal(database.isReady(), true);
  assert.equal(connections, 1);
  assert.equal(initializations, 1);
  client.connection.readyState = 0;
  assert.equal(database.isReady(), false);
});

test('a failed cold-start connection is retried on the next request', async () => {
  let attempts = 0;
  const client = {
    connection: { readyState: 0 },
    async connect() {
      if (++attempts === 1) throw new Error('Connection unavailable');
      client.connection.readyState = 1;
      return client;
    },
  };
  const database = createDatabaseConnection({
    uri: 'mongodb://test-host/postroom',
    client,
    initialize: async () => {},
  });
  await assert.rejects(database.connect(), /Connection unavailable/);
  assert.equal(database.isReady(), false);
  await database.connect();
  assert.equal(database.isReady(), true);
  assert.equal(attempts, 2);
});

test('a missing hosted URI never falls back to a local or unrelated database', async () => {
  let attempts = 0;
  const database = createDatabaseConnection({
    uri: '',
    client: {
      connection: { readyState: 0 },
      async connect() {
        attempts++;
      },
    },
  });
  await assert.rejects(database.connect(), /MONGODB_URI is not configured/);
  assert.equal(database.isReady(), false);
  assert.equal(attempts, 0);
});
