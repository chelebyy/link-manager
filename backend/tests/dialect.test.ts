import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const FEATURE_FILES = [
  'categories/routes.ts',
  'data/routes.ts',
  'resource-types/routes.ts',
  'resources/routes.ts',
  'resources/url-conflicts.ts',
];

const loadFreshDb = async (cacheKey: string) => {
  // Cache-bust the ESM import: db.isPostgres is captured at module load,
  // so each scenario must import a fresh copy of the module.
  return import(`../src/shared/db/index.js?lm007=${cacheKey}`);
};

test('dialect: db.isPostgres is true when DATABASE_URL contains "postgresql"', async () => {
  const prev = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  try {
    const { db } = await loadFreshDb('pg');
    assert.equal(db.isPostgres, true);
  } finally {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  }
});

test('dialect: db.isPostgres is false when DATABASE_URL is unset', async () => {
  const prev = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const { db } = await loadFreshDb('unset');
    assert.equal(db.isPostgres, false);
  } finally {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  }
});

test('dialect: db.isPostgres is false when DATABASE_URL points to sqlite', async () => {
  const prev = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'file:./data/test.db';
  try {
    const { db } = await loadFreshDb('sqlite');
    assert.equal(db.isPostgres, false);
  } finally {
    if (prev === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prev;
  }
});

test('dialect: all feature routes use shared/db as the single source of truth', async () => {
  const featuresDir = path.join(process.cwd(), 'src', 'features');
  for (const rel of FEATURE_FILES) {
    const file = path.join(featuresDir, rel);
    const content = await readFile(file, 'utf8');
    assert.doesNotMatch(
      content,
      /process\.env\.DATABASE_URL\?\.includes\(['"]postgresql['"]\)/,
      `${rel} must not duplicate the postgresql check`
    );
    assert.match(
      content,
      /from\s+['"][^'"]*shared\/db\/index(\.js)?['"]/,
      `${rel} must import from shared/db/index`
    );
  }
});
