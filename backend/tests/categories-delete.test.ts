import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';

const setupAppWithTempDb = async (t: any) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-cat-delete-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;

  const { closeDb, initDb, query } = await import('../src/shared/db/index.js');
  const { categoriesRoutes } = await import('../src/features/categories/routes.js');

  await initDb();

  const app = Fastify({ logger: false });
  await app.register(categoriesRoutes, { prefix: '/api/categories' });

  t.after(async () => {
    await app.close();
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    await rm(tempDir, { recursive: true, force: true });
  });

  return { app, query };
};

test('DELETE /api/categories/:id existing returns 204 and nulls resources.category_id atomically', async (t) => {
  const { app, query } = await setupAppWithTempDb(t);

  // Seed a category and a resource linked to it.
  const catInsert = await query(
    `INSERT INTO categories (name, type, color, icon, sort_order)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ['Cat A', 'website', '#6366f1', 'Folder', 1],
  );
  const categoryId = (catInsert.rows[0] as { id: number }).id;

  const resInsert = await query(
    `INSERT INTO resources (category_id, type, title, url, metadata, sort_order)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [categoryId, 'website', 'Linked Resource', 'https://linked.test/a', '{}', 1],
  );
  const resourceId = (resInsert.rows[0] as { id: number }).id;

  const response = await app.inject({
    method: 'DELETE',
    url: `/api/categories/${categoryId}`,
  });

  assert.equal(response.statusCode, 204);

  // Category must be gone.
  const catCheck = await query('SELECT COUNT(*) AS c FROM categories WHERE id = ?', [categoryId]);
  assert.equal(Number((catCheck.rows[0] as any).c), 0, 'category row should have been removed');

  // Resource must still exist with category_id = NULL.
  const resCheck = await query('SELECT category_id FROM resources WHERE id = ?', [resourceId]);
  assert.equal(resCheck.rows.length, 1, 'resource should still exist');
  assert.equal((resCheck.rows[0] as any).category_id, null, 'resource.category_id should be NULL');
});

test('DELETE /api/categories/:id non-existent returns 404', async (t) => {
  const { app } = await setupAppWithTempDb(t);

  const response = await app.inject({
    method: 'DELETE',
    url: '/api/categories/999999',
  });

  assert.equal(response.statusCode, 404);
  const body = response.json();
  assert.ok(body.error, 'response should include an error message');
});

test('DELETE /api/categories/:id rolls back UPDATE when DELETE fails (atomic)', async (t) => {
  const { app, query } = await setupAppWithTempDb(t);

  // Seed category + linked resource.
  const catInsert = await query(
    `INSERT INTO categories (name, type, color, icon, sort_order)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
    ['Cat Rollback', 'website', '#6366f1', 'Folder', 1],
  );
  const categoryId = (catInsert.rows[0] as { id: number }).id;

  const resInsert = await query(
    `INSERT INTO resources (category_id, type, title, url, metadata, sort_order)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [categoryId, 'website', 'Rollback Resource', 'https://rollback.test/a', '{}', 1],
  );
  const resourceId = (resInsert.rows[0] as { id: number }).id;

  // Install a BEFORE DELETE trigger that forces failure for this category id.
  // The trigger fires AFTER the UPDATE succeeds — if no transaction wraps both
  // statements, the resource will be left with category_id = NULL while the
  // category row remains, breaking atomicity.
  await query(
    `CREATE TRIGGER fail_cat_delete_${categoryId}
     BEFORE DELETE ON categories
     WHEN OLD.id = ${categoryId}
     BEGIN
       SELECT RAISE(ABORT, 'forced delete failure');
     END;`,
  );

  const response = await app.inject({
    method: 'DELETE',
    url: `/api/categories/${categoryId}`,
  });

  // Handler must surface the failure (not 204).
  assert.notEqual(response.statusCode, 204, 'failed DELETE must not report success');

  // Category row must still exist.
  const catCheck = await query('SELECT COUNT(*) AS c FROM categories WHERE id = ?', [categoryId]);
  assert.equal(Number((catCheck.rows[0] as any).c), 1, 'category should not have been deleted');

  // Critical: the UPDATE that nulled category_id must have rolled back.
  const resCheck = await query('SELECT category_id FROM resources WHERE id = ?', [resourceId]);
  assert.equal(resCheck.rows.length, 1, 'resource should still exist');
  assert.equal(
    Number((resCheck.rows[0] as any).category_id),
    categoryId,
    'resource.category_id should have been rolled back to original value',
  );
});
