import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerRateLimits } from '../src/shared/rate-limit.js';

async function buildApp() {
  const app = Fastify();
  await registerRateLimits(app);
  app.addHook('preHandler', async (request, reply) => {
    if (request.url !== '/api/health' && request.headers.authorization !== 'Bearer test-key') {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
  // Match legacy resource route config and its explicit middleware as well.
  app.get('/api/resources', { config: { rateLimit: { max: 60, timeWindow: '15 minutes' } }, preHandler: app.rateLimit() }, async () => []);
  app.get('/api/categories', async () => []);
  app.get('/api/health', { config: { rateLimit: false } }, async () => ({ ok: true }));
  app.post('/api/resources', async () => ({ ok: true }));
  app.post('/api/data/import', { config: { rateLimit: { max: 20, timeWindow: '15 minutes' } } }, async () => ({ ok: true }));
  await app.ready();
  return app;
}
const headers = { authorization: 'Bearer test-key' };

test('normal read traffic exceeds old 60-request ceiling but remains bounded at 120/minute', async t => {
  const app = await buildApp(); t.after(() => app.close());
  for (let index = 0; index < 120; index++) {
    const response = await app.inject({ url: '/api/resources', headers });
    assert.equal(response.statusCode, 200, `read ${index + 1}`);
  }
  const limited = await app.inject({ url: '/api/resources', headers });
  assert.equal(limited.statusCode, 429);
  assert.ok(Number(limited.headers['retry-after']) <= 60);
  assert.equal((await app.inject({ url: '/api/categories', headers })).statusCode, 200);
  assert.equal((await app.inject({ url: '/api/health' })).statusCode, 200);
  // Reads neither spend nor disable the existing mutation budget.
  for (let index = 0; index < 60; index++) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/resources', headers })).statusCode, 200);
  }
  assert.equal((await app.inject({ method: 'POST', url: '/api/resources', headers })).statusCode, 429);
});

test('manual import keeps its 20-per-15-minute budget', async t => {
  const app = await buildApp(); t.after(() => app.close());
  for (let index = 0; index < 20; index++) {
    assert.equal((await app.inject({ method: 'POST', url: '/api/data/import', headers })).statusCode, 200);
  }
  const response = await app.inject({ method: 'POST', url: '/api/data/import', headers });
  assert.equal(response.statusCode, 429);
  assert.ok(Number(response.headers['retry-after']) > 60);
});

test('reads still require authentication and forwarded headers cannot reset the quota', async t => {
  const app = await buildApp(); t.after(() => app.close());
  assert.equal((await app.inject({ url: '/api/categories' })).statusCode, 401);
  for (let index = 1; index < 120; index++) {
    assert.equal((await app.inject({ url: '/api/categories', headers })).statusCode, 200);
  }
  assert.equal((await app.inject({ url: '/api/categories', headers: { ...headers, 'x-forwarded-for': '192.0.2.50' } })).statusCode, 429);
});
