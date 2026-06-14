import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

test('PATCH /api/resources/:id can move a resource between types', async (t) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-update-type-'));
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

  await query(
    `INSERT INTO categories (id, name, type, color, icon, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [9201, 'Docs', 'website', '#111111', 'BookOpen', 1],
  );
  await query(
    `INSERT INTO categories (id, name, type, color, icon, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [9202, 'Docs', 'github', '#222222', 'Github', 1],
  );
  await query(
    `INSERT INTO categories (id, name, type, color, icon, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [9203, 'Learning', 'skill', '#333333', 'Wrench', 1],
  );

  await query(
    `INSERT INTO resources (id, category_id, type, title, url, metadata, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [9101, 9201, 'website', 'Move Me', 'https://move.test', '{}', 1],
  );
  await query(
    `INSERT INTO resources (id, type, title, url, metadata, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [9102, 'github', 'Existing One', 'https://github.com/example/one', '{}', 1],
  );
  await query(
    `INSERT INTO resources (id, type, title, url, metadata, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [9103, 'github', 'Existing Two', 'https://github.com/example/two', '{}', 2],
  );

  await t.test('moves the resource and appends it to the destination type order', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/9101',
      payload: { type: 'github', category_id: null },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { type: string; sort_order: number };
    assert.equal(body.type, 'github');
    assert.equal(body.sort_order, 3);

    const verify = await query('SELECT type, category_id, sort_order FROM resources WHERE id = ?', [9101]);
    assert.deepEqual(verify.rows[0], { type: 'github', category_id: 9202, sort_order: 3 });
  });

  await t.test('creates a matching category in the destination type when none exists', async () => {
    await query(
      `INSERT INTO resources (id, category_id, type, title, url, metadata, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [9105, 9203, 'skill', 'Skill Resource', 'https://skill.test', '{}', 1],
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/9105',
      payload: { type: 'website', category_id: null },
    });

    assert.equal(response.statusCode, 200);

    const categoryResult = await query(
      'SELECT id, name, type, color, icon, sort_order FROM categories WHERE name = ? AND type = ?',
      ['Learning', 'website'],
    );
    assert.equal(categoryResult.rows.length, 1);
    const category = categoryResult.rows[0] as { id: number; name: string; type: string; color: string; icon: string; sort_order: number };
    assert.equal(category.color, '#333333');
    assert.equal(category.icon, 'Wrench');
    assert.equal(category.sort_order, 2);

    const verify = await query('SELECT type, category_id FROM resources WHERE id = ?', [9105]);
    assert.deepEqual(verify.rows[0], { type: 'website', category_id: category.id });
  });

  await t.test('rejects a move when the destination type already has the same URL', async () => {
    await query(
      `INSERT INTO resources (id, type, title, url, metadata, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [9104, 'website', 'Would Conflict', 'https://github.com/example/one', '{}', 2],
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/resources/9104',
      payload: { type: 'github' },
    });

    assert.equal(response.statusCode, 409);
    assert.equal((response.json() as { error: string }).error, 'URL zaten mevcut');
  });
});
