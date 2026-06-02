import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConfig } from '../src/shared/config/index.js';

test('validateConfig: throws in production when DATABASE_URL is missing', () => {
  assert.throws(
    () => validateConfig({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    /DATABASE_URL is required in production/,
  );
});

test('validateConfig: warns but returns config in development when DATABASE_URL is missing', () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (msg: string) => {
    warnings.push(String(msg));
  };

  try {
    const cfg = validateConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    assert.equal(cfg.databaseUrl, undefined);
    assert.equal(cfg.nodeEnv, 'development');
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.frontendUrl, 'http://localhost:5173');
    assert.ok(
      warnings.some((w) => w.includes('DATABASE_URL is not set')),
      'expected a warning about missing DATABASE_URL',
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('validateConfig: returns config in production when DATABASE_URL is set', () => {
  const cfg = validateConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    LINK_MANAGER_API_KEY: 'secret',
    PORT: '4000',
  } as NodeJS.ProcessEnv);

  assert.equal(cfg.nodeEnv, 'production');
  assert.equal(cfg.databaseUrl, 'postgresql://user:pass@host:5432/db');
  assert.equal(cfg.apiKey, 'secret');
  assert.equal(cfg.port, 4000);
});
