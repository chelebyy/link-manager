import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import Fastify from 'fastify';

// Opt-in only. Creates and removes its own uniquely named local database.
const testUrl = process.env.TEST_POSTGRES_URL;
test('PostgreSQL import acceptance', { skip: !testUrl, timeout: 30000 }, async t => {
  const url = new URL(testUrl!);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only a disposable local PostgreSQL server is allowed');
  const admin = new Pool({ connectionString: url.toString() });
  const name = `link_manager_import_test_${randomUUID().replaceAll('-', '')}`;
  const previousUrl = process.env.DATABASE_URL;
  let created = false;
  let cleanupApp: (() => Promise<unknown>) | undefined;
  let cleanupDb: (() => Promise<unknown>) | undefined;
  let cleanupPeer: (() => Promise<unknown>) | undefined;
  t.after(async () => {
    const errors: unknown[] = [];
    for (const cleanup of [cleanupApp, cleanupDb, cleanupPeer,
      async () => { if (created) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`); },
      () => admin.end()]) {
      try { await cleanup?.(); } catch (error) { errors.push(error); }
    }
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (errors.length) throw new AggregateError(errors, 'PostgreSQL acceptance cleanup failed');
  });
  await admin.query(`CREATE DATABASE ${name}`);
  created = true;
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const { initDb, closeDb, query } = await import('../src/shared/db/index.js');
  cleanupDb = closeDb;
  const { dataRoutes } = await import('../src/features/data/routes.js');
  const { resourcesRoutes } = await import('../src/features/resources/routes.js');
  const { categoriesRoutes } = await import('../src/features/categories/routes.js');
  const peer = new Pool({ connectionString: url.toString() });
  cleanupPeer = () => peer.end();
  const app = Fastify({ logger: false });
  cleanupApp = () => app.close();
  await initDb();
  app.decorate('rateLimit', () => async () => {});
  await app.register(dataRoutes, { prefix: '/api/data' });
  await app.register(resourcesRoutes, { prefix: '/api/resources' });
  await app.register(categoriesRoutes, { prefix: '/api/categories' });
  const snapshot = async () => {
    const response = await app.inject('/api/data/export');
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };
  const submit = (payload: object) => app.inject({ method: 'POST', url: '/api/data/import', payload });
  const fresh = async (payload: object) => submit({ ...payload, expected_revision: (await snapshot()).revision });
  const reset = async () => { await query('TRUNCATE resources, categories RESTART IDENTITY CASCADE'); };
  const waitForBlockedImport = async () => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const result = await peer.query("SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'LOCK TABLE resource_types,%'");
      if (result.rows.length) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('The import never reached the table lock');
  };

  await t.test('round-trip existing URLs, relations and metadata; later generated IDs exceed imported IDs', async () => {
    await reset();
    const imported = await fresh({ categories: [{ id: 500, name: 'Türkçe kategori', type: 'website' }], resources: [
      { id: 1001, category_id: 500, type: 'website', title: 'İlk kaynak', url: 'https://example.test/one', metadata: { nested: { b: 2, a: 1 } }, is_favorite: true },
    ] });
    assert.equal(imported.statusCode, 200, imported.body);
    const exported = await snapshot();
    const roundTrip = await submit({ ...exported, expected_revision: exported.revision });
    assert.equal(roundTrip.statusCode, 200, roundTrip.body);
    const rows = (await snapshot()).resources;
    assert.equal(rows[0].category_id, '500');
    assert.deepEqual(rows[0].metadata, { nested: { a: 1, b: 2 } });
    assert.equal(rows[0].is_favorite, true);
    const partialCategory = await app.inject({ method: 'PUT', url: '/api/categories/500', payload: { color: '#222222' } });
    assert.equal(partialCategory.statusCode, 200, partialCategory.body);
    assert.equal(partialCategory.json().name, 'Türkçe kategori');
    assert.equal(partialCategory.json().color, '#222222');
    const category = await app.inject({ method: 'POST', url: '/api/categories', payload: { name: 'Next', type: 'website', color: '#6366f1', icon: 'Folder' } });
    assert.equal(category.statusCode, 201, category.body);
    assert.ok(Number(category.json().id) > 500);
    const resource = await app.inject({ method: 'POST', url: '/api/resources', payload: { title: 'Next', type: 'website', url: 'https://example.test/next', description: null, category_id: 500 } });
    assert.equal(resource.statusCode, 201, resource.body);
    assert.ok(Number(resource.json().id) > 1001);
  });

  await t.test('stale version and missing version are rejected without partial writes', async () => {
    await reset();
    await query("INSERT INTO categories (id, name, type) VALUES (10, 'Original', 'website')");
    const before = await snapshot();
    await peer.query("UPDATE categories SET name = 'Other client' WHERE id = 10");
    const rejected = await submit({ expected_revision: before.revision, categories: [{ id: 10, name: 'Overwrite', type: 'website' }], resourceTypes: [{ id: 'forbidden-partial', name: 'No' }] });
    assert.equal(rejected.statusCode, 409, rejected.body);
    assert.equal((await query('SELECT name FROM categories WHERE id = 10')).rows[0].name, 'Other client');
    assert.equal((await query("SELECT * FROM resource_types WHERE id = 'forbidden-partial'")).rows.length, 0);
    assert.equal((await submit({ categories: [] })).statusCode, 428);
  });

  await t.test('a writer committing while import waits is detected inside the transaction', async () => {
    await reset();
    await query("INSERT INTO categories (id, name, type) VALUES (10, 'Original', 'website')");
    const before = await snapshot();
    const writer = await peer.connect();
    try {
      await writer.query('BEGIN');
      await writer.query("UPDATE categories SET name = 'Concurrent edit' WHERE id = 10");
      const pending = submit({ expected_revision: before.revision, categories: [{ id: 10, name: 'Overwrite', type: 'website' }] }).then(r => r);
      await waitForBlockedImport();
      await writer.query('COMMIT');
      const rejected = await pending;
      assert.equal(rejected.statusCode, 409, rejected.body);
      assert.equal((await query('SELECT name FROM categories WHERE id = 10')).rows[0].name, 'Concurrent edit');
    } finally { await writer.query('ROLLBACK'); writer.release(); }
  });

  await t.test('two importers sharing a revision have exactly one winner', async () => {
    await reset();
    const expected_revision = (await snapshot()).revision;
    const results = await Promise.all(['First', 'Second'].map(name => submit({ expected_revision, categories: [{ id: 20, name, type: 'website' }] })));
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    assert.equal((await snapshot()).categories[0].name, results[0].statusCode === 200 ? 'First' : 'Second');
  });

  await t.test('conflicting URL rolls back earlier card and category changes', async () => {
    await reset();
    await query("INSERT INTO resources (type, title, url) VALUES ('website', 'Retain', 'https://example.test/duplicate')");
    const before = await snapshot();
    const result = await fresh({ resourceTypes: [{ id: 'rollback-card', name: 'Rollback' }], categories: [{ id: 50, name: 'Rollback', type: 'website' }], resources: [
      { id: 5000, category_id: 50, type: 'website', title: 'Conflict', url: 'https://example.test/duplicate' },
    ] });
    assert.equal(result.statusCode, 409, result.body);
    assert.equal((await snapshot()).revision, before.revision);
  });
});
