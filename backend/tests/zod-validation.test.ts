import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';

test('zod validation enforces strict schemas on resources + sync routes', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-zod-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;

  const { closeDb, initDb } = await import('../src/shared/db/index.js');
  const { resourcesRoutes } = await import('../src/features/resources/routes.js');
  const { syncRoutes } = await import('../src/features/sync/routes.js');

  const app = Fastify({ logger: false });
  await app.register(resourcesRoutes, { prefix: '/api/resources' });
  await app.register(syncRoutes, { prefix: '/api' });

  t.after(async () => {
    await app.close();
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    await rm(tempDir, { recursive: true, force: true });
  });

  await initDb();

  // ---------- GET /api/resources query validation ----------

  await t.test('GET /api/resources rejects invalid sort with 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?sort=password',
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as { error: string };
    assert.ok(body.error, 'response should include an error message');
  });

  await t.test('GET /api/resources rejects invalid order with 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?order=DROP',
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as { error: string };
    assert.ok(body.error, 'response should include an error message');
  });

  await t.test('GET /api/resources accepts a valid query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?sort=title&order=asc&type=website',
    });

    assert.equal(response.statusCode, 200);
    assert.ok(Array.isArray(response.json()), 'response should be an array');
  });

  await t.test('GET /api/resources rejects extra/unknown query params (strict mode)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?sort=id&order=asc&injected=1',
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as { error: string };
    assert.ok(body.error, 'response should include an error message');
  });

  await t.test('GET /api/resources with no params uses defaults (sort=sort_order, order=asc)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources',
    });

    assert.equal(response.statusCode, 200);
  });

  await t.test('GET /api/resources?favorite=false is accepted', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?favorite=false',
    });

    assert.equal(response.statusCode, 200);
  });

  await t.test('GET /api/resources?favorite=yes is rejected (must be true|false)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?favorite=yes',
    });

    assert.equal(response.statusCode, 400);
  });

  // ---------- POST /api/resources body validation ----------

  await t.test('POST /api/resources rejects missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resources',
      payload: { title: 'Only title' },
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as { error: string };
    assert.ok(body.error, 'response should include an error message');
  });

  await t.test('POST /api/resources rejects extra fields (strict mode)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resources',
      payload: { type: 'website', title: 'T', extra_field: 'nope' },
    });

    assert.equal(response.statusCode, 400);
  });

  // ---------- PATCH /api/resources/:id/favorite body validation ----------

  await t.test('PATCH /api/resources/:id/favorite rejects non-boolean is_favorite', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/1/favorite',
      payload: { is_favorite: 'yes' },
    });

    assert.equal(response.statusCode, 400);
  });

  await t.test('PATCH /api/resources/:id/favorite rejects empty body', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/1/favorite',
      payload: {},
    });

    assert.equal(response.statusCode, 400);
  });

  // ---------- POST /api/resources/preview-github body validation ----------

  await t.test('POST /api/resources/preview-github rejects missing url', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resources/preview-github',
      payload: {},
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as { error: string };
    assert.ok(body.error, 'response should include an error message');
  });

  await t.test('POST /api/resources/preview-github rejects non-string url', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resources/preview-github',
      payload: { url: 42 },
    });

    assert.equal(response.statusCode, 400);
  });

  await t.test('POST /api/resources/preview-github rejects empty url string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resources/preview-github',
      payload: { url: '' },
    });

    assert.equal(response.statusCode, 400);
  });

  await t.test('POST /api/resources/preview-github extracts owner/repo from a valid GitHub URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resources/preview-github',
      payload: { url: 'https://github.com/anthropics/anthropic-sdk-typescript' },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { owner: string; repo: string; full_name: string };
    assert.equal(body.owner, 'anthropics');
    assert.equal(body.repo, 'anthropic-sdk-typescript');
    assert.equal(body.full_name, 'anthropics/anthropic-sdk-typescript');
  });

  await t.test('POST /api/resources/preview-github still returns 400 for non-GitHub URL (route-level check)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/resources/preview-github',
      payload: { url: 'https://example.com/foo/bar' },
    });

    assert.equal(response.statusCode, 400);
    const body = response.json() as { error: string };
    assert.match(body.error, /GitHub/i);
  });

  // ---------- PATCH /api/resources/reorder still works with new preHandler ----------

  await t.test('PATCH /api/resources/reorder rejects non-integer ids via zod', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/reorder',
      payload: { ids: ['a', 'b'] },
    });

    assert.equal(response.statusCode, 400);
  });

  await t.test('PATCH /api/resources/reorder rejects empty array via zod', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/reorder',
      payload: { ids: [] },
    });

    assert.equal(response.statusCode, 400);
  });
});
