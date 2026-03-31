import { Pool } from 'pg';
import dotenv from 'dotenv';
import { initSqliteDb, sqliteQuery } from './sqlite.js';

dotenv.config();

const isDev = process.env.NODE_ENV !== 'production';
const usePostgres = process.env.DATABASE_URL?.includes('postgresql');

export const db = {
  isPostgres: usePostgres,
  
  async query(text: string, params?: any[]) {
    if (usePostgres) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const client = await pool.connect();
      try {
        const result = await client.query(text, params);
        return result;
      } finally {
        client.release();
        await pool.end();
      }
    } else {
      const result = sqliteQuery(text, params);
      return { rows: Array.isArray(result) ? result : [], rowCount: (result as any).changes };
    }
  },

  async init() {
    if (usePostgres) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const client = await pool.connect();
      try {
        await client.query(`
          DO $$ BEGIN
            CREATE TYPE resource_type AS ENUM ('github', 'skill', 'website', 'note');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);

        await client.query(`
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

        await client.query(`
          ALTER TABLE categories
          ADD COLUMN IF NOT EXISTS type VARCHAR(20);
        `);

        await client.query(`
          UPDATE categories SET type = 'website' WHERE type IS NULL;
        `);

        await client.query(`
          ALTER TABLE categories
          ALTER COLUMN type SET DEFAULT 'website',
          ALTER COLUMN type SET NOT NULL;
        `);

        await client.query(`
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

        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS categories_name_type_unique_idx
          ON categories(name, type);
        `);

        await client.query(`
          ALTER TABLE IF EXISTS resources
          ALTER COLUMN type TYPE TEXT,
          ALTER COLUMN type SET NOT NULL;
        `).catch(() => {});

        await client.query(`
          CREATE TABLE IF NOT EXISTS resources (
            id BIGSERIAL PRIMARY KEY,
            category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL,
            type TEXT NOT NULL,
            title VARCHAR(200) NOT NULL,
            url TEXT,
            description TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `);

        await client.query(`
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
      } finally {
        client.release();
        await pool.end();
      }
    } else {
      initSqliteDb();
    }
  }
};

export const query = db.query.bind(db);
export const initDb = db.init.bind(db);
