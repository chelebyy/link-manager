import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

test('resources route DELETE returns 204 for existing, 404 for missing, 400 for invalid id', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-delete-'));
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

  // Seed a single resource to delete later
  const insertResult = await query(
    `INSERT INTO resources (type, title, url, metadata, sort_order)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ['website', 'Deletable', 'https://delete.test', '{}', 1],
  );
  const seededId = (insertResult.rows[0] as { id: number }).id;

  await t.test('DELETE /api/resources/:id for an existing resource returns 204', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/resources/${seededId}`,
    });

    assert.equal(response.statusCode, 204);

    // Confirm the row was actually removed
    const verify = await query('SELECT COUNT(*) as count FROM resources WHERE id = ?', [seededId]);
    const row = verify.rows[0] as { count: number };
    assert.equal(row.count, 0, 'existing resource should have been removed from the database');
  });

  await t.test('DELETE /api/resources/:id for a non-existent id returns 404', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/resources/999999',
    });

    assert.equal(response.statusCode, 404);
    const body = response.json();
    assert.ok(body.error, 'response should include an error message');
  });

  await t.test('DELETE /api/resources/:id with a non-numeric id returns 400', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/resources/not-a-number',
    });

    assert.equal(response.statusCode, 400);
    const body = response.json();
    assert.ok(body.error, 'response should include an error message');
  });
});
