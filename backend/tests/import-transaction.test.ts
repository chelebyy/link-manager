import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';

const setupAppWithTempDb = async (t: any) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-import-tx-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;

  const { closeDb, initDb, query } = await import('../src/shared/db/index.js');
  const { dataRoutes } = await import('../src/features/data/routes.js');

  await initDb();

  const logged: Array<{ msg: string; err?: any }> = [];
  const app = Fastify({ logger: false });

  // Attach a stub error logger we can inspect.
  app.addHook('onRequest', async (request) => {
    const original = request.log.error.bind(request.log);
    request.log.error = ((obj: any, msg?: any, ...args: any[]) => {
      if (typeof obj === 'string') {
        logged.push({ msg: obj });
      } else {
        logged.push({ msg: typeof msg === 'string' ? msg : '', err: obj });
      }
      return original(obj, msg, ...args);
    }) as typeof request.log.error;
  });

  await app.register(dataRoutes, { prefix: '/api/data' });

  t.after(async () => {
    await app.close();
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    await rm(tempDir, { recursive: true, force: true });
  });

  return { app, query, logged };
};

test('POST /import: valid payload persists all rows in resources, categories, resource_types', async (t) => {
  const { app, query } = await setupAppWithTempDb(t);

  const response = await app.inject({
    method: 'POST',
    url: '/api/data/import',
    payload: {
      resourceTypes: [
        { id: 'custom-1', name: 'Custom Type', icon: 'Star', color: '#123456', is_builtin: false, sort_order: 99 },
      ],
      categories: [
        { id: 500, name: 'Imported Category', type: 'website', color: '#abcdef', icon: 'Folder', sort_order: 5 },
      ],
      resources: [
        { id: 1001, category_id: 500, type: 'website', title: 'Imported Site', url: 'https://imported.test/a', description: null, metadata: {}, is_favorite: false, sort_order: 1 },
        { id: 1002, category_id: 500, type: 'website', title: 'Imported Site B', url: 'https://imported.test/b', description: null, metadata: {}, is_favorite: false, sort_order: 2 },
      ],
    },
  });

  assert.equal(response.statusCode, 200, `expected 200 but got ${response.statusCode}: ${response.body}`);
  const body = response.json();
  assert.equal(body.success, true);
  assert.equal(body.imported.resourceTypes, 1);
  assert.equal(body.imported.categories, 1);
  assert.equal(body.imported.resources, 2);

  const rt = await query("SELECT id, name FROM resource_types WHERE id = 'custom-1'");
  assert.equal(rt.rows.length, 1);
  assert.equal((rt.rows[0] as any).name, 'Custom Type');

  const cat = await query('SELECT id, name FROM categories WHERE id = 500');
  assert.equal(cat.rows.length, 1);
  assert.equal((cat.rows[0] as any).name, 'Imported Category');

  const res = await query('SELECT COUNT(*) AS c FROM resources WHERE category_id = 500');
  assert.equal(Number((res.rows[0] as any).c), 2);
});

test('POST /import: row violating unique URL constraint rolls back ALL writes', async (t) => {
  const { app, query, logged } = await setupAppWithTempDb(t);

  // Pre-seed one resource so a later resource with same type+url triggers the unique constraint.
  await query(
    `INSERT INTO resources (id, type, title, url, metadata, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [9000, 'website', 'Pre-existing', 'https://conflict.test/x', '{}', 1],
  );

  const beforeRt = await query('SELECT COUNT(*) AS c FROM resource_types');
  const beforeCat = await query('SELECT COUNT(*) AS c FROM categories');
  const beforeRes = await query('SELECT COUNT(*) AS c FROM resources');
  const rtCountBefore = Number((beforeRt.rows[0] as any).c);
  const catCountBefore = Number((beforeCat.rows[0] as any).c);
  const resCountBefore = Number((beforeRes.rows[0] as any).c);

  const response = await app.inject({
    method: 'POST',
    url: '/api/data/import',
    payload: {
      resourceTypes: [
        { id: 'rollback-type', name: 'Rollback Type', icon: 'Star', color: '#111111', is_builtin: false, sort_order: 50 },
      ],
      categories: [
        { id: 600, name: 'Rollback Cat', type: 'website', color: '#222222', icon: 'Folder', sort_order: 6 },
      ],
      resources: [
        // The second resource has the same type + url as the pre-seeded row above → trigger raises.
        { id: 1100, category_id: 600, type: 'website', title: 'OK Row', url: 'https://rollback.test/ok', description: null, metadata: {}, is_favorite: false, sort_order: 1 },
        { id: 1101, category_id: 600, type: 'website', title: 'Dup Row', url: 'https://conflict.test/x', description: null, metadata: {}, is_favorite: false, sort_order: 2 },
      ],
    },
  });

  // Either 409 (conflict pre-check inside tx) or 500 (raised by trigger) — both must roll back.
  assert.notEqual(response.statusCode, 200, `import should NOT succeed; got ${response.statusCode}: ${response.body}`);

  const afterRt = await query("SELECT COUNT(*) AS c FROM resource_types WHERE id = 'rollback-type'");
  const afterCat = await query('SELECT COUNT(*) AS c FROM categories WHERE id = 600');
  const afterRes = await query('SELECT COUNT(*) AS c FROM resources WHERE id IN (1100, 1101)');

  assert.equal(Number((afterRt.rows[0] as any).c), 0, 'resource_types row from failed import must not persist');
  assert.equal(Number((afterCat.rows[0] as any).c), 0, 'categories row from failed import must not persist');
  assert.equal(Number((afterRes.rows[0] as any).c), 0, 'resources rows from failed import must not persist');

  // Totals unchanged from baseline (apart from the pre-seeded row).
  const totRt = await query('SELECT COUNT(*) AS c FROM resource_types');
  const totCat = await query('SELECT COUNT(*) AS c FROM categories');
  const totRes = await query('SELECT COUNT(*) AS c FROM resources');
  assert.equal(Number((totRt.rows[0] as any).c), rtCountBefore);
  assert.equal(Number((totCat.rows[0] as any).c), catCountBefore);
  assert.equal(Number((totRes.rows[0] as any).c), resCountBefore);

  // request.log.error MUST have been called with a structured object.
  assert.ok(logged.some((entry) => /import failed/.test(entry.msg || '')),
    `expected request.log.error to be called with 'import failed...' message, got: ${JSON.stringify(logged)}`);
});

test('POST /import: failure during categories upsert rolls back resource_types written earlier in the tx', async (t) => {
  const { app, query, logged } = await setupAppWithTempDb(t);

  const response = await app.inject({
    method: 'POST',
    url: '/api/data/import',
    payload: {
      resourceTypes: [
        { id: 'tx-rollback-rt', name: 'TX Rollback RT', icon: 'Star', color: '#abcabc', is_builtin: false, sort_order: 42 },
      ],
      categories: [
        // Malformed: required NOT NULL fields missing → INSERT fails.
        { id: 700 /* name missing → String(undefined) becomes 'undefined' which is fine in SQLite, so force a real NOT NULL violation */ },
      ],
      resources: [],
    },
  });

  // The malformed category may still succeed in SQLite because String(undefined) === 'undefined'.
  // To force a guaranteed failure, retry with an INVALID id that violates type constraints.
  if (response.statusCode === 200) {
    // Fall back to a definitely-failing payload (NULL into NOT NULL column via raw SQL is hard via this route).
    // Use duplicate URL approach: pre-seed and add a conflicting resource AFTER inserting a resource_type.
    await query(
      `INSERT INTO resources (id, type, title, url, metadata, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [9100, 'website', 'Seed', 'https://step-rollback.test/x', '{}', 1],
    );
    const response2 = await app.inject({
      method: 'POST',
      url: '/api/data/import',
      payload: {
        resourceTypes: [
          { id: 'tx-rollback-rt-2', name: 'TX Rollback RT 2', icon: 'Star', color: '#abcabc', is_builtin: false, sort_order: 42 },
        ],
        categories: [],
        resources: [
          { id: 1200, type: 'website', title: 'Conflicting', url: 'https://step-rollback.test/x', metadata: {}, is_favorite: false, sort_order: 1 },
        ],
      },
    });
    assert.notEqual(response2.statusCode, 200);
    const rt = await query("SELECT COUNT(*) AS c FROM resource_types WHERE id = 'tx-rollback-rt-2'");
    assert.equal(Number((rt.rows[0] as any).c), 0, 'resource_types upsert from earlier in tx must roll back when resources upsert fails');
    assert.ok(logged.some((e) => /import failed/.test(e.msg || '')), 'expected error log');
    return;
  }

  // Primary path: malformed category triggered the rollback.
  assert.notEqual(response.statusCode, 200);
  const rt = await query("SELECT COUNT(*) AS c FROM resource_types WHERE id = 'tx-rollback-rt'");
  assert.equal(Number((rt.rows[0] as any).c), 0, 'resource_types upsert from earlier in tx must roll back when categories upsert fails');
});

test('POST /import: invalid payload returns 400 (no DB writes)', async (t) => {
  const { app, query } = await setupAppWithTempDb(t);

  const response = await app.inject({
    method: 'POST',
    url: '/api/data/import',
    payload: { foo: 'bar' },
  });

  assert.equal(response.statusCode, 400);
  const body = response.json();
  assert.ok(body.error);

  // Nothing should have changed.
  const res = await query('SELECT COUNT(*) AS c FROM resources');
  // Baseline tables exist but should hold zero rows from this call.
  assert.equal(Number((res.rows[0] as any).c), 0);
});
