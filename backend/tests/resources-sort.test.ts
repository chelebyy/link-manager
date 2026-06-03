import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

test('resources route rejects invalid sort and order query params', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-sort-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;

  const { closeDb, initDb, query } = await import('../src/shared/db/index.js');
  const { resourcesRoutes } = await import('../src/features/resources/routes.js');

  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: '15 minutes',
    keyGenerator: (request) => request.ip,
    skipOnError: true,
  });
  await app.register(resourcesRoutes, { prefix: '/api/resources' });

  t.after(async () => {
    await app.close();
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    await rm(tempDir, { recursive: true, force: true });
  });

  await initDb();

  // Seed two resources with different titles to verify ordering
  await query(
    `INSERT INTO resources (type, title, url, metadata, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    ['website', 'Alpha', 'https://alpha.test', '{}', 1],
  );
  await query(
    `INSERT INTO resources (type, title, url, metadata, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    ['website', 'Beta', 'https://beta.test', '{}', 2],
  );

  await t.test('GET /api/resources?sort=invalid returns 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?sort=invalid',
    });

    assert.equal(response.statusCode, 400);
    const body = response.json();
    assert.ok(body.error, 'response should include an error message');
  });

  await t.test('GET /api/resources?order=BAD returns 400', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?order=BAD',
    });

    assert.equal(response.statusCode, 400);
    const body = response.json();
    assert.ok(body.error, 'response should include an error message');
  });

  await t.test('GET /api/resources?sort=title&order=asc returns 200 with ascending title order', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?sort=title&order=asc',
    });

    assert.equal(response.statusCode, 200);
    const rows = response.json() as Array<{ title: string }>;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].title, 'Alpha');
    assert.equal(rows[1].title, 'Beta');
  });

  await t.test('GET /api/resources?sort=id; DROP TABLE resources;-- returns 400 (injection attempt)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources?sort=id; DROP TABLE resources;--',
    });

    assert.equal(response.statusCode, 400);
    // Confirm the table still exists and is queryable
    const verify = await query('SELECT COUNT(*) as count FROM resources');
    const row = verify.rows[0] as { count: number };
    assert.ok(row.count >= 2, 'resources table should still hold seeded rows after injection attempt');
  });

  await t.test('GET /api/resources (no params) returns 200 with default sort', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/resources',
    });

    assert.equal(response.statusCode, 200);
    const rows = response.json() as Array<{ id: number }>;
    assert.equal(rows.length, 2);
  });
});
