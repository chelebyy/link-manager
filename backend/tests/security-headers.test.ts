import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

// Mirror of the helmet registration from src/server.ts. We intentionally
// duplicate it here (rather than importing server.ts, which boots the app
// and opens the DB) so the test is fast, isolated, and exercises the exact
// configuration that ships in production.
const buildApp = async () => {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  });

  // SEC-10: mirror production helmet config.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  app.get('/api/ping', async () => ({ pong: true }));

  return app;
};

test('SEC-10: response includes X-Frame-Options to prevent clickjacking', async (t) => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/api/ping' });
  const xfo = res.headers['x-frame-options'];
  assert.ok(xfo, 'x-frame-options header should be present');
  // Helmet defaults to SAMEORIGIN. Accept either SAMEORIGIN or DENY.
  assert.ok(
    xfo === 'SAMEORIGIN' || xfo === 'DENY',
    `x-frame-options should be SAMEORIGIN or DENY, got ${xfo}`,
  );
});

test('SEC-10: response includes Strict-Transport-Security (HSTS)', async (t) => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/api/ping' });
  const hsts = res.headers['strict-transport-security'];
  assert.ok(hsts, 'strict-transport-security header should be present');
  // Helmet default HSTS includes max-age and includeSubDomains.
  assert.ok(hsts.includes('max-age='), 'HSTS should include max-age directive');
});

test('SEC-10: response includes X-Content-Type-Options: nosniff', async (t) => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/api/ping' });
  const xcto = res.headers['x-content-type-options'];
  assert.equal(xcto, 'nosniff', 'x-content-type-options should be "nosniff"');
});

test('SEC-10: CORS headers still work (no regression on @fastify/cors)', async (t) => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  // Preflight (OPTIONS) from the SPA origin.
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/api/ping',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    },
  });

  assert.equal(preflight.statusCode, 204, 'preflight should return 204');
  assert.equal(
    preflight.headers['access-control-allow-origin'],
    'http://localhost:5173',
    'CORS allow-origin should echo the SPA origin',
  );
  assert.ok(
    preflight.headers['access-control-allow-methods'],
    'CORS allow-methods should be present',
  );
  assert.ok(
    preflight.headers['access-control-allow-headers'],
    'CORS allow-headers should be present',
  );
  assert.equal(
    preflight.headers['access-control-allow-credentials'],
    'true',
    'CORS allow-credentials should be true (mirrors cors config)',
  );

  // Actual request from the SPA origin.
  const actual = await app.inject({
    method: 'GET',
    url: '/api/ping',
    headers: { origin: 'http://localhost:5173' },
  });
  assert.equal(actual.statusCode, 200);
  assert.equal(
    actual.headers['access-control-allow-origin'],
    'http://localhost:5173',
    'CORS allow-origin should be present on actual responses too',
  );
  // The body should still parse as JSON — helmet must not corrupt the
  // response payload.
  const body = actual.json();
  assert.deepEqual(body, { pong: true });
});

test('SEC-10: helmet does not add a CSP header (disabled by config)', async (t) => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/api/ping' });
  // CSP is intentionally disabled because the SPA is served from a
  // different origin and the API only returns JSON.
  assert.equal(
    res.headers['content-security-policy'],
    undefined,
    'content-security-policy should not be set',
  );
});

test('SEC-10: cross-origin-resource-policy is cross-origin', async (t) => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/api/ping' });
  const corp = res.headers['cross-origin-resource-policy'];
  assert.equal(corp, 'cross-origin');
});
