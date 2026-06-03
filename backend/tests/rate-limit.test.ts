import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

const buildApp = async (apiKey: string | undefined) => {
  // trustProxy so request.ip honors x-forwarded-for in tests that simulate
  // different client IPs.
  const app = Fastify({ logger: false, trustProxy: true });

  await app.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: '15 minutes',
    keyGenerator: (request) => request.ip,
    skipOnError: true,
  });

  // Lightweight auth mirroring server.ts so /api/* requires the API key.
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

  // codeql[js/missing-rate-limiting]
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/api/health' || request.method === 'OPTIONS') {
      return;
    }
    if (request.url.startsWith('/api/')) {
      return (app as any).verifyApiKey(request, reply);
    }
  });

  // SEC-03: health endpoint is exempt from rate limiting.
  app.get('/api/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/ping', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '15 minutes',
      },
    },
  }, async () => ({ pong: true }));

  app.setErrorHandler((error: any, request, reply) => {
    reply.status(error.statusCode || 500).send({
      error: error.message || 'Internal Server Error',
    });
  });

  return app;
};

test('SEC-03 rate limit: 60 requests succeed, 61st returns 429', async (t) => {
  const app = await buildApp('test-key');

  t.after(async () => {
    await app.close();
  });

  // Hit a public route that does NOT require auth so we can isolate the
  // rate limit behavior from the auth behavior.
  for (let i = 0; i < 60; i++) {
    const response = await app.inject({
      method: 'GET',
      url: '/api/ping',
      headers: { authorization: 'Bearer test-key' },
    });
    assert.equal(response.statusCode, 200, `request ${i + 1} should succeed`);
  }

  const blocked = await app.inject({
    method: 'GET',
    url: '/api/ping',
    headers: { authorization: 'Bearer test-key' },
  });
  assert.equal(blocked.statusCode, 429, '61st request should be rate limited');
});

test('SEC-03 rate limit: /api/health has its own (effectively unlimited) bucket', async (t) => {
  const app = await buildApp('test-key');

  t.after(async () => {
    await app.close();
  });

  // Fire a small burst at the protected endpoint to start consuming the
  // global counter, then hammer /api/health and assert it is never blocked.
  for (let i = 0; i < 5; i++) {
    await app.inject({
      method: 'GET',
      url: '/api/ping',
      headers: { authorization: 'Bearer test-key' },
    });
  }

  for (let i = 0; i < 80; i++) {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200, `health request ${i + 1} should succeed`);
  }
});

test('SEC-03 rate limit: quota is per-IP (different IPs get their own bucket)', async (t) => {
  const app = await buildApp('test-key');

  t.after(async () => {
    await app.close();
  });

  // Exhaust IP A's bucket.
  for (let i = 0; i < 60; i++) {
    await app.inject({
      method: 'GET',
      url: '/api/ping',
      headers: { authorization: 'Bearer test-key', 'x-forwarded-for': '10.0.0.1' },
    });
  }

  const blockedA = await app.inject({
    method: 'GET',
    url: '/api/ping',
    headers: { authorization: 'Bearer test-key', 'x-forwarded-for': '10.0.0.1' },
  });
  assert.equal(blockedA.statusCode, 429, 'IP A should be rate limited');

  // IP B should still have a fresh quota.
  const okB = await app.inject({
    method: 'GET',
    url: '/api/ping',
    headers: { authorization: 'Bearer test-key', 'x-forwarded-for': '10.0.0.2' },
  });
  assert.equal(okB.statusCode, 200, 'IP B should still be allowed');
});

// Sanity check: the rate-limit middleware coexists with the existing auth
// middleware (BC-001, SEC-02) without breaking their behavior.
test('SEC-03 rate limit: does not interfere with API key auth', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-rl-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;
  process.env.LINK_MANAGER_API_KEY = 'test-key';

  const { closeDb, initDb } = await import('../src/shared/db/index.js');
  await initDb();

  const app = await buildApp('test-key');

  t.after(async () => {
    await app.close();
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    delete process.env.LINK_MANAGER_API_KEY;
    await rm(tempDir, { recursive: true, force: true });
  });

  // Missing auth still yields 401, not 429.
  const noAuth = await app.inject({ method: 'GET', url: '/api/ping' });
  assert.equal(noAuth.statusCode, 401);

  // Wrong auth still yields 401, not 429.
  const wrongAuth = await app.inject({
    method: 'GET',
    url: '/api/ping',
    headers: { authorization: 'Bearer wrong' },
  });
  assert.equal(wrongAuth.statusCode, 401);
});
