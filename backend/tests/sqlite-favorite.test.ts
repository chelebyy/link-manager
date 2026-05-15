import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('sqlite updates with RETURNING expose rows and rowCount for favorite toggles', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-sqlite-'));
  const dbPath = path.join(tempDir, 'test.db');

  process.env.SQLITE_DB_PATH = dbPath;
  delete process.env.DATABASE_URL;

  const { closeDb, initDb, query } = await import('../src/shared/db/index.js');

  try {
    await initDb();

    const insertResult = await query(
      `INSERT INTO resources (type, title, metadata, is_favorite, sort_order)
       VALUES (?, ?, ?, ?, ?)
       RETURNING *`,
      ['github', 'Regression Resource', '{}', 0, 1],
    );

    assert.equal(insertResult.rowCount, 1);
    assert.equal(insertResult.rows.length, 1);

    const resourceId = Number((insertResult.rows[0] as { id: number }).id);

    const updateResult = await query(
      `UPDATE resources
       SET is_favorite = ?, updated_at = datetime('now')
       WHERE id = ?
       RETURNING *`,
      [1, resourceId],
    );

    assert.equal(updateResult.rowCount, 1);
    assert.equal(updateResult.rows.length, 1);
    assert.equal((updateResult.rows[0] as { is_favorite: number }).is_favorite, 1);
  } finally {
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    await rm(tempDir, { recursive: true, force: true });
  }
});
