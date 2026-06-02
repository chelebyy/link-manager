import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';

test('PATCH /api/resources/reorder validates input, runs atomically inside a transaction', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-reorder-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;

  const { closeDb, initDb, query } = await import('../src/shared/db/index.js');
  const { resourcesRoutes } = await import('../src/features/resources/routes.js');

  const app = Fastify({ logger: false });
  await app.register(resourcesRoutes, { prefix: '/api/resources' });

  t.after(async () => {
    await app.close();
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    await rm(tempDir, { recursive: true, force: true });
  });

  await initDb();

  // Seed three resources with known sort_order so we can detect rollbacks.
  const seed = async (title: string, sortOrder: number) => {
    const insertResult = await query(
      `INSERT INTO resources (type, title, url, metadata, sort_order)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      ['website', title, `https://reorder.test/${title}`, '{}', sortOrder],
    );
    return (insertResult.rows[0] as { id: number }).id;
  };

  const idA = await seed('alpha', 10);
  const idB = await seed('beta', 20);
  const idC = await seed('gamma', 30);

  const getSortOrders = async (): Promise<Record<number, number>> => {
    const rows = await query<{ id: number; sort_order: number }>(
      'SELECT id, sort_order FROM resources WHERE id IN (?, ?, ?)',
      [idA, idB, idC],
    );
    const map: Record<number, number> = {};
    for (const row of rows.rows) {
      map[row.id] = row.sort_order;
    }
    return map;
  };

  await t.test('valid array of existing ids returns 204 and updates sort_order', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/reorder',
      payload: { ids: [idC, idA, idB] },
    });

    assert.equal(response.statusCode, 204);
    const orders = await getSortOrders();
    assert.equal(orders[idC], 1, 'first id should have sort_order=1');
    assert.equal(orders[idA], 2, 'second id should have sort_order=2');
    assert.equal(orders[idB], 3, 'third id should have sort_order=3');
  });

  await t.test('empty array returns 400', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/reorder',
      payload: { ids: [] },
    });

    assert.equal(response.statusCode, 400);
    assert.ok(response.json().error, 'response should include an error');
  });

  await t.test('non-array body returns 400', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/reorder',
      payload: { ids: 'not-an-array' },
    });

    assert.equal(response.statusCode, 400);
    assert.ok(response.json().error, 'response should include an error');
  });

  await t.test('non-integer values return 400', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/reorder',
      payload: { ids: [idA, 'oops', 2.5] },
    });

    assert.equal(response.statusCode, 400);
    assert.ok(response.json().error, 'response should include an error');
  });

  await t.test('duplicate ids return 400', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/reorder',
      payload: { ids: [idA, idB, idA] },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().error, /duplicate/i);
  });

  await t.test('all non-existent ids return 400', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/reorder',
      payload: { ids: [999_991, 999_992, 999_993] },
    });

    assert.equal(response.statusCode, 400);
    assert.ok(response.json().error, 'response should include an error');
  });

  await t.test('partial failure rolls back updates (atomicity)', async () => {
    // Snapshot the current sort_order before the failing call.
    const before = await getSortOrders();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/reorder',
      payload: { ids: [idA, 999_999, idB] },
    });

    assert.equal(response.statusCode, 400);

    const after = await getSortOrders();
    assert.equal(
      after[idA],
      before[idA],
      'idA sort_order must remain unchanged when the reorder fails partway through',
    );
    assert.equal(
      after[idB],
      before[idB],
      'idB sort_order must remain unchanged when the reorder fails partway through',
    );
    assert.equal(
      after[idC],
      before[idC],
      'idC sort_order must remain unchanged when the reorder fails partway through',
    );
  });
});
