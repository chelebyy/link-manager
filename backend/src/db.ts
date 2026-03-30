import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'link-manager.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

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

  CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category_id);
  CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
  CREATE INDEX IF NOT EXISTS idx_resources_favorite ON resources(is_favorite);

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
`);

console.log('SQLite database initialized at:', dbPath);

export { db };
