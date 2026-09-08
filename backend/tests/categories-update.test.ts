import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';

test('partial category updates preserve other fields and support full forms', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-category-update-'));
  process.env.SQLITE_DB_PATH = path.join(dir, 'test.db');
  delete process.env.DATABASE_URL;
  const { initDb, closeDb, query } = await import('../src/shared/db/index.js');
  const { categoriesRoutes } = await import('../src/features/categories/routes.js');
  const app = Fastify({ logger: false });
  t.after(async () => {
    try { await app.close(); } finally {
      try { await closeDb(); } finally {
        delete process.env.SQLITE_DB_PATH;
        await rm(dir, { recursive: true, force: true });
      }
    }
  });
  await initDb();
  await app.register(categoriesRoutes, { prefix: '/api/categories' });
  await query("INSERT INTO categories (id, name, type, color, icon) VALUES (1, 'Original', 'website', '#111111', 'Folder')");
  // A peer renames the category after the tool's earlier discovery read.
  await query("UPDATE categories SET name = 'Peer rename' WHERE id = 1");
  const response = await app.inject({ method: 'PUT', url: '/api/categories/1', payload: { color: '#222222' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().name, 'Peer rename');
  assert.equal(response.json().color, '#222222');
  assert.equal(response.json().icon, 'Folder');
  const full = await app.inject({ method: 'PUT', url: '/api/categories/1', payload: { name: 'Full form', color: '#333333', icon: 'Star' } });
  assert.equal(full.statusCode, 200);
  assert.equal(full.json().name, 'Full form');
  const longName = 'Existing name '.repeat(10);
  await query('UPDATE categories SET name = ? WHERE id = 1', [longName]);
  const existingLong = await app.inject({ method: 'PUT', url: '/api/categories/1', payload: { name: longName, color: '#444444', icon: 'Star' } });
  assert.equal(existingLong.statusCode, 200, 'existing SQLite names remain editable with the full form');
  for (const payload of [{}, { name: '' }, { name: null }, { type: 'note' }, { unexpected: 'value' }]) {
    assert.equal((await app.inject({ method: 'PUT', url: '/api/categories/1', payload })).statusCode, 400);
  }
  assert.equal((await app.inject({ method: 'PUT', url: '/api/categories/999', payload: { name: 'Missing' } })).statusCode, 404);
});
