import { createHash } from 'node:crypto';
import { db, type TxQuery } from '../../shared/db/index.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

export async function lockImportData(txQuery: TxQuery, write: boolean) {
  if (db.isPostgres) {
    // Take the lock before reading in READ COMMITTED, so a writer we waited
    // for is visible. These table locks also cover inserts and direct SQL.
    await txQuery('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await txQuery("SET LOCAL lock_timeout = '10s'");
    await txQuery(`LOCK TABLE resource_types, categories, resources IN ${write ? 'SHARE ROW EXCLUSIVE' : 'SHARE'} MODE`);
  }
}

export async function readDataSnapshot(txQuery: TxQuery) {
  const resourceTypes = (await txQuery('SELECT * FROM resource_types ORDER BY sort_order ASC, name ASC, id ASC')).rows;
  const categories = (await txQuery('SELECT * FROM categories ORDER BY sort_order ASC, name ASC, id ASC')).rows;
  const resources = (await txQuery('SELECT * FROM resources ORDER BY sort_order ASC, created_at ASC, id ASC')).rows;
  const data = { resourceTypes, categories, resources };
  // Round-trip Dates exactly as Fastify's JSON response does.
  const revision = createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(data))))).digest('hex');
  return { ...data, revision };
}
