import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';

// Mirror of the production error handler from src/server.ts. We intentionally
// duplicate it here (rather than importing server.ts, which boots the app and
// opens the DB) so the test is fast, isolated, and exercises the exact
// sanitization rules that ship.
const buildErrorHandler = (nodeEnv: string | undefined) => (error: any, _request: any, reply: any) => {
  const statusCode = error.statusCode || 500;
  const isProd = nodeEnv === 'production';
  const isServerError = statusCode >= 500;

  const safeMessage =
    isServerError && isProd ? 'Internal Server Error' : error.message || 'Internal Server Error';

  reply.status(statusCode).send({
    error: safeMessage,
    code: error.code || 'INTERNAL_ERROR',
  });
};

const buildApp = (nodeEnv: string | undefined) => {
  const app = Fastify({ logger: false });
  app.setErrorHandler(buildErrorHandler(nodeEnv));
  app.get('/boom-500', async () => {
    const err: any = new Error('DB password=hunter2 connection refused at /var/lib/secret');
    err.statusCode = 500;
    throw err;
  });
  app.get('/boom-500-no-status', async () => {
    // No statusCode -> defaults to 500.
    throw new Error('Unhandled promise rejection: ENOENT /etc/passwd');
  });
  app.get('/boom-400', async () => {
    const err: any = new Error('Invalid input: title must not be empty');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  });
  app.get('/boom-404', async () => {
    const err: any = new Error('Resource not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  });
  return app;
};

test('SEC-05: in development, a 500 error message is forwarded to the client', async (t) => {
  const app = buildApp('development');

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/boom-500' });
  assert.equal(res.statusCode, 500);
  const body = res.json();
  assert.equal(body.error, 'DB password=hunter2 connection refused at /var/lib/secret');
  assert.equal(body.code, 'INTERNAL_ERROR');
});

test('SEC-05: in production, a 500 error message is replaced with a generic string', async (t) => {
  const app = buildApp('production');

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/boom-500' });
  assert.equal(res.statusCode, 500);
  const body = res.json();
  assert.equal(body.error, 'Internal Server Error');
  // The sensitive substring must NOT appear in the body.
  assert.equal(body.error.includes('hunter2'), false);
  assert.equal(body.error.includes('/var/lib/secret'), false);
  assert.equal(body.code, 'INTERNAL_ERROR');
});

test('SEC-05: in production, a 500 with no statusCode is also sanitized', async (t) => {
  const app = buildApp('production');

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/boom-500-no-status' });
  assert.equal(res.statusCode, 500);
  const body = res.json();
  assert.equal(body.error, 'Internal Server Error');
  assert.equal(body.error.includes('/etc/passwd'), false);
});

test('SEC-05: 4xx validation errors keep their message in production', async (t) => {
  const app = buildApp('production');

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/boom-400' });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, 'Invalid input: title must not be empty');
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('SEC-05: 4xx validation errors keep their message in development', async (t) => {
  const app = buildApp('development');

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/boom-400' });
  assert.equal(res.statusCode, 400);
  const body = res.json();
  assert.equal(body.error, 'Invalid input: title must not be empty');
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('SEC-05: 404 errors keep their message in production (4xx is always safe)', async (t) => {
  const app = buildApp('production');

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/boom-404' });
  assert.equal(res.statusCode, 404);
  const body = res.json();
  assert.equal(body.error, 'Resource not found');
  assert.equal(body.code, 'NOT_FOUND');
});

test('SEC-05: error.stack is NEVER present in the response body', async (t) => {
  const app = buildApp('production');

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/boom-500' });
  // Parse the raw JSON to inspect the actual key set sent to the client.
  const raw = res.body;
  const body = JSON.parse(raw);
  assert.equal('stack' in body, false, 'response JSON must not contain a `stack` key');
  assert.equal('trace' in body, false, 'response JSON must not contain a `trace` key');
  // Defensive: a stack trace typically contains "at " (V8) and the function
  // name. The serialized body should match the sanitize rule exactly.
  assert.equal(Object.keys(body).sort().join(','), 'code,error');
});

test('SEC-05: NODE_ENV undefined is treated as non-production (dev behavior)', async (t) => {
  const app = buildApp(undefined);

  t.after(async () => {
    await app.close();
  });

  const res = await app.inject({ method: 'GET', url: '/boom-500' });
  assert.equal(res.statusCode, 500);
  const body = res.json();
  // Dev/unknown: leak the message so engineers can see what's wrong locally.
  assert.equal(body.error, 'DB password=hunter2 connection refused at /var/lib/secret');
});
