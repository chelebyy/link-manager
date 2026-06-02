import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const setupDb = async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-dispatcher-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;

  const { closeDb, initDb, query } = await import('../src/shared/db/index.js');
  await initDb();

  return {
    query,
    cleanup: async () => {
      await closeDb();
      delete process.env.SQLITE_DB_PATH;
      await rm(tempDir, { recursive: true, force: true });
    },
  };
};

test('sqlite dispatcher: SELECT returns rows via .all()', async () => {
  const { query, cleanup } = await setupDb();
  try {
    await query(
      `INSERT INTO resources (type, title, metadata, is_favorite, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      ['website', 'Dispatcher SELECT', '{}', 0, 1],
    );

    const result = await query(
      `SELECT id, title FROM resources WHERE type = ? ORDER BY id`,
      ['website'],
    );

    assert.equal(result.rowCount, 1);
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { title: string }).title, 'Dispatcher SELECT');
  } finally {
    await cleanup();
  }
});

test('sqlite dispatcher: WITH ... SELECT (CTE read) returns rows', async () => {
  const { query, cleanup } = await setupDb();
  try {
    await query(
      `INSERT INTO resources (type, title, metadata, is_favorite, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      ['github', 'Dispatcher CTE', '{}', 0, 1],
    );

    const result = await query(
      `WITH filtered AS (
         SELECT id, title, type FROM resources WHERE type = ?
       )
       SELECT id, title FROM filtered ORDER BY id`,
      ['github'],
    );

    assert.equal(result.rowCount, 1);
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { title: string }).title, 'Dispatcher CTE');
  } finally {
    await cleanup();
  }
});

test('sqlite dispatcher: INSERT without RETURNING returns no rows', async () => {
  const { query, cleanup } = await setupDb();
  try {
    const result = await query(
      `INSERT INTO resources (type, title, metadata, is_favorite, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      ['note', 'Dispatcher INSERT', '{}', 0, 1],
    );

    assert.equal(result.rows.length, 0);
  } finally {
    await cleanup();
  }
});

test('sqlite dispatcher: INSERT ... RETURNING returns the inserted row', async () => {
  const { query, cleanup } = await setupDb();
  try {
    const result = await query(
      `INSERT INTO resources (type, title, metadata, is_favorite, sort_order)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`,
      ['skill', 'Dispatcher RETURNING', '{}', 0, 1],
    );

    assert.equal(result.rowCount, 1);
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { title: string }).title, 'Dispatcher RETURNING');
  } finally {
    await cleanup();
  }
});

test('sqlite dispatcher: WITH ... INSERT ... RETURNING (CTE write) returns the row', async () => {
  const { query, cleanup } = await setupDb();
  try {
    const result = await query(
      `WITH src(name) AS (VALUES (?))
       INSERT INTO resources (type, title, metadata, is_favorite, sort_order)
       SELECT ?, name, ?, ?, ? FROM src
       RETURNING *`,
      ['Dispatcher CTE Write', 'website', '{}', 0, 1],
    );

    assert.equal(result.rowCount, 1);
    assert.equal(result.rows.length, 1);
    assert.equal((result.rows[0] as { title: string }).title, 'Dispatcher CTE Write');
  } finally {
    await cleanup();
  }
});
