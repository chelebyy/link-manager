import Database from 'better-sqlite3';
import { dbConfig } from './config.js';

let db: Database.Database | null = null;

export const initSqliteDb = () => {
  if (db) return db;
  
  db = new Database('link-manager.db');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#6366f1',
      icon TEXT NOT NULL DEFAULT 'Folder',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('github', 'skill', 'website', 'note')),
      title TEXT NOT NULL,
      url TEXT,
      description TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS resources_category_idx ON resources(category_id);
    CREATE INDEX IF NOT EXISTS resources_type_idx ON resources(type);
    CREATE INDEX IF NOT EXISTS resources_favorite_idx ON resources(is_favorite);

    CREATE TABLE IF NOT EXISTS resource_sync_state (
      resource_id INTEGER PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
      github_id INTEGER UNIQUE,
      github_owner TEXT NOT NULL,
      github_repo TEXT NOT NULL,
      github_full_name TEXT NOT NULL,
      last_commit_sha TEXT,
      last_commit_date TEXT,
      last_commit_message TEXT,
      last_commit_author TEXT,
      last_release_tag TEXT,
      last_release_date TEXT,
      last_release_notes TEXT,
      last_tag TEXT,
      last_tag_date TEXT,
      acknowledged_release TEXT,
      release_notification_active INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT,
      has_updates INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS resource_version_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      version_type TEXT NOT NULL,
      version_value TEXT NOT NULL,
      release_notes TEXT,
      detected_at TEXT DEFAULT (datetime('now')),
      acknowledged_at TEXT
    );
  `);
  
  console.log('SQLite database initialized');
  return db;
};

export const sqliteQuery = (sql: string, params?: any[]) => {
  const database = initSqliteDb();
  const stmt = database.prepare(sql);
  if (sql.trim().toLowerCase().startsWith('select')) {
    return params && params.length > 0 ? stmt.all(...params) : stmt.all();
  } else {
    return params && params.length > 0 ? stmt.run(...params) : stmt.run();
  }
};

export { db as sqliteDb };
