import { Pool, type PoolClient } from 'pg';
import dotenv from 'dotenv';
import { closeSqliteDb, initSqliteDb, sqliteQuery } from './sqlite.js';

dotenv.config();

const usePostgres = process.env.DATABASE_URL?.includes('postgresql');
let postgresPool: Pool | null = null;

const getPostgresPool = () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PostgreSQL mode');
  }

  postgresPool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return postgresPool;
};

const getSqliteRowCount = (result: unknown) => {
  if (typeof result === 'object' && result !== null && 'rowCount' in result) {
    return Number(result.rowCount);
  }

  if (typeof result === 'object' && result !== null && 'changes' in result) {
    return Number(result.changes);
  }

  return 0;
};

const getSqliteRows = (result: unknown) => {
  if (Array.isArray(result)) {
    return result;
  }

  if (typeof result === 'object' && result !== null && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows;
  }

  return [];
};

export const db = {
  isPostgres: usePostgres,
  
  async query(text: string, params?: unknown[]) {
    if (usePostgres) {
      return getPostgresPool().query(text, params);
    } else {
      const result = sqliteQuery(text, params);
      return { rows: getSqliteRows(result), rowCount: getSqliteRowCount(result) };
    }
  },

  async init() {
    if (usePostgres) {
      const pool = getPostgresPool();
      await pool.query(`
          DO $$ BEGIN
            CREATE TYPE resource_type AS ENUM ('github', 'skill', 'website', 'note');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS categories (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(80) NOT NULL,
            type VARCHAR(20) NOT NULL DEFAULT 'website',
            color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
            icon VARCHAR(64) NOT NULL DEFAULT 'Folder',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await pool.query(`
          ALTER TABLE categories
          ADD COLUMN IF NOT EXISTS type VARCHAR(20);
        `);

        await pool.query(`
          ALTER TABLE categories
          ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
        `);

        await pool.query(`
          UPDATE categories SET type = 'website' WHERE type IS NULL;
        `);

        await pool.query(`
          ALTER TABLE categories
          ALTER COLUMN type SET DEFAULT 'website',
          ALTER COLUMN type SET NOT NULL;
        `);

        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = 'categories_type_check'
            ) THEN
              ALTER TABLE categories
              ADD CONSTRAINT categories_type_check
              CHECK (type IN ('github', 'skill', 'website', 'note'));
            END IF;
          END
          $$;
        `);

        await pool.query(`
          ALTER TABLE categories
          DROP CONSTRAINT IF EXISTS categories_type_check;
        `);

        await pool.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS categories_name_type_unique_idx
          ON categories(name, type);
        `);

        await pool.query(`
          UPDATE categories SET sort_order = id WHERE sort_order = 0;
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS resource_types (
            id VARCHAR(80) PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            icon VARCHAR(64) NOT NULL DEFAULT 'Folder',
            color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
            description TEXT,
            is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await pool.query(`
          INSERT INTO resource_types (id, name, icon, color, is_builtin, sort_order)
          VALUES
            ('github', 'GitHub Repos', 'Github', '#333', TRUE, 1),
            ('skill', 'Skills', 'Wrench', '#6366f1', TRUE, 2),
            ('website', 'Websites', 'Globe', '#10b981', TRUE, 3),
            ('note', 'Notes', 'FileText', '#f59e0b', TRUE, 4)
          ON CONFLICT (id) DO NOTHING;
        `);

        await pool.query(`
          ALTER TABLE IF EXISTS resources
          ALTER COLUMN type TYPE TEXT,
          ALTER COLUMN type SET NOT NULL;
        `).catch(() => {});

        await pool.query(`
          ALTER TABLE IF EXISTS resources
          ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS resources (
            id BIGSERIAL PRIMARY KEY,
            category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
            type TEXT NOT NULL,
            title VARCHAR(200) NOT NULL,
            url TEXT,
            description TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await pool.query(`
          UPDATE resources SET sort_order = id WHERE sort_order = 0;
        `);

        await pool.query(`
          CREATE OR REPLACE FUNCTION enforce_resource_url_uniqueness()
          RETURNS TRIGGER AS $$
          BEGIN
            IF NEW.url IS NULL THEN
              RETURN NEW;
            END IF;

            IF TG_OP = 'UPDATE'
              AND NEW.type IS NOT DISTINCT FROM OLD.type
              AND NEW.url IS NOT DISTINCT FROM OLD.url THEN
              RETURN NEW;
            END IF;

            IF EXISTS (
              SELECT 1
              FROM resources
              WHERE type = NEW.type
                AND url = NEW.url
                AND (TG_OP = 'INSERT' OR id <> NEW.id)
            ) THEN
              RAISE EXCEPTION 'URL zaten mevcut' USING ERRCODE = '23505';
            END IF;

            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        `);

        await pool.query(`
          DROP TRIGGER IF EXISTS resources_block_duplicate_url_on_write ON resources;
        `);

        await pool.query(`
          CREATE TRIGGER resources_block_duplicate_url_on_write
          BEFORE INSERT OR UPDATE OF type, url ON resources
          FOR EACH ROW
          EXECUTE FUNCTION enforce_resource_url_uniqueness();
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS categories_type_sort_order_idx
          ON categories(type, sort_order);
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS resource_types_sort_order_idx
          ON resource_types(sort_order);
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS resources_category_idx
          ON resources(category_id);
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS resources_type_idx
          ON resources(type);
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS resources_favorite_idx
          ON resources(is_favorite);
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS resources_type_sort_order_idx
          ON resources(type, sort_order);
        `);

        await pool.query(`
          CREATE INDEX IF NOT EXISTS resources_category_sort_order_idx
          ON resources(category_id, sort_order);
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS resource_sync_state (
            resource_id BIGINT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
            github_id BIGINT UNIQUE,
            github_owner VARCHAR(120) NOT NULL,
            github_repo VARCHAR(120) NOT NULL,
            github_full_name VARCHAR(260) NOT NULL,
            last_commit_sha VARCHAR(64),
            last_commit_date TIMESTAMPTZ,
            last_commit_message TEXT,
            last_commit_author VARCHAR(200),
            last_release_tag VARCHAR(120),
            last_release_date TIMESTAMPTZ,
            last_release_notes TEXT,
            last_tag VARCHAR(120),
            last_tag_date TIMESTAMPTZ,
            acknowledged_release VARCHAR(120),
            release_notification_active BOOLEAN NOT NULL DEFAULT FALSE,
            last_sync_at TIMESTAMPTZ,
            has_updates BOOLEAN NOT NULL DEFAULT FALSE
          );
        `);

      console.log('PostgreSQL database initialized');
    } else {
      initSqliteDb();
    }
  },

  async close() {
    if (postgresPool) {
      await postgresPool.end();
      postgresPool = null;
      return;
    }

    closeSqliteDb();
  }
};

export const query = db.query.bind(db);
export const initDb = db.init.bind(db);
export const closeDb = db.close.bind(db);

export type TxQueryResult = { rows: any[]; rowCount: number };
export type TxQuery = (sql: string, params?: unknown[]) => Promise<TxQueryResult>;

const runPostgresTransaction = async <T>(fn: (txQuery: TxQuery) => Promise<T>): Promise<T> => {
  const pool = getPostgresPool();
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const txQuery: TxQuery = async (sql, params) => {
      const result = await client.query(sql, params as any[]);
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    };
    const out = await fn(txQuery);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
};

const runSqliteTransaction = async <T>(fn: (txQuery: TxQuery) => Promise<T>): Promise<T> => {
  const database = initSqliteDb();
  database.exec('BEGIN');
  let committed = false;
  try {
    const txQuery: TxQuery = async (sql, params) => {
      const result = sqliteQuery(sql, params as any[] | undefined);
      return { rows: getSqliteRows(result), rowCount: getSqliteRowCount(result) };
    };
    const out = await fn(txQuery);
    database.exec('COMMIT');
    committed = true;
    return out;
  } finally {
    if (!committed) {
      try { database.exec('ROLLBACK'); } catch { /* ignore */ }
    }
  }
};

export async function withTransaction<T>(fn: (txQuery: TxQuery) => Promise<T>): Promise<T> {
  if (usePostgres) {
    return runPostgresTransaction(fn);
  }
  return runSqliteTransaction(fn);
}
