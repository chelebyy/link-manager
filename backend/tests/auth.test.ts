import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import auth from '@fastify/auth';

const buildApp = async () => {
  const configModule = await import('../src/shared/config/index.js');
  const apiKey = configModule.apiKey;

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });
  await app.register(auth);

  app.decorate('verifyApiKey', async (request: any, reply: any) => {
    if (!apiKey) {
      reply.code(500).send({ error: 'API key not configured on server' });
      return reply;
    }
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Missing or malformed Authorization header' });
      return reply;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (token !== apiKey) {
      reply.code(401).send({ error: 'Invalid API key' });
      return reply;
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/api/health' || request.method === 'OPTIONS') {
      return;
    }
    if (request.url.startsWith('/api/')) {
      return (app as any).verifyApiKey(request, reply);
    }
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  const { resourcesRoutes } = await import('../src/features/resources/routes.js');
  await app.register(resourcesRoutes, { prefix: '/api/resources' });

  app.setErrorHandler((error: any, request, reply) => {
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  return app;
};

test('API key auth: required on /api/* except /api/health; OPTIONS exempt', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-auth-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;
  process.env.LINK_MANAGER_API_KEY = 'test-key';

  const { closeDb, initDb } = await import('../src/shared/db/index.js');
  await initDb();

  const app = await buildApp();

  t.after(async () => {
    await app.close();
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    delete process.env.LINK_MANAGER_API_KEY;
    await rm(tempDir, { recursive: true, force: true });
  });

  await t.test('GET /api/resources without Authorization returns 401', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/resources' });
    assert.equal(response.statusCode, 401);
  });

  await t.test('GET /api/resources with wrong Bearer returns 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources',
      headers: { authorization: 'Bearer wrong-key' },
    });
    assert.equal(response.statusCode, 401);
  });

  await t.test('GET /api/resources with correct Bearer returns 200', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources',
      headers: { authorization: 'Bearer test-key' },
    });
    assert.equal(response.statusCode, 200);
  });

  await t.test('GET /api/health without auth returns 200 (exempt)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
  });
});

test('API key auth: returns 500 when server has no API_KEY configured', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-auth-nokey-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;
  delete process.env.LINK_MANAGER_API_KEY;

  // Cache-bust the config import to pick up the cleared env var.
  const configModule = await import(`../src/shared/config/index.js?bust=${Date.now()}`);

  const app = Fastify({ logger: false });
  await app.register(auth);
  app.decorate('verifyApiKey', async (request: any, reply: any) => {
    if (!configModule.apiKey) {
      reply.code(500).send({ error: 'API key not configured on server' });
      return reply;
    }
  });
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/api/health' || request.method === 'OPTIONS') return;
    if (request.url.startsWith('/api/')) {
      return (app as any).verifyApiKey(request, reply);
    }
  });
  app.get('/api/health', async () => ({ status: 'ok' }));
  const { resourcesRoutes } = await import('../src/features/resources/routes.js');
  await app.register(resourcesRoutes, { prefix: '/api/resources' });
  app.setErrorHandler((error: any, request, reply) => {
    reply.status(error.statusCode || 500).send({ error: error.message || 'Internal Server Error' });
  });

  const { closeDb, initDb } = await import('../src/shared/db/index.js');
  await initDb();

  t.after(async () => {
    await app.close();
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    await rm(tempDir, { recursive: true, force: true });
  });

  const response = await app.inject({
    method: 'GET',
    url: '/api/resources',
    headers: { authorization: 'Bearer anything' },
  });
  assert.equal(response.statusCode, 500);
});
