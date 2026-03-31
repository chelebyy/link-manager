import Database from 'better-sqlite3';
import { dbConfig } from './config.js';

let db: Database.Database | null = null;

const DEFAULT_CATEGORY_TYPE = 'website';

const createResourceTypesTableSql = `
  CREATE TABLE IF NOT EXISTS resource_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Folder',
    color TEXT NOT NULL DEFAULT '#6366f1',
    description TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`;

const createCategoriesTableSql = `
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '${DEFAULT_CATEGORY_TYPE}',
    color TEXT NOT NULL DEFAULT '#6366f1',
    icon TEXT NOT NULL DEFAULT 'Folder',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`;

const hasLegacyUniqueNameConstraint = (database: Database.Database) => {
  const indexes = database.prepare(`PRAGMA index_list('categories')`).all() as Array<{ name: string; unique: number }>;

  return indexes.some((index) => {
    if (index.unique !== 1) {
      return false;
    }

    const columns = database.prepare(`PRAGMA index_info('${index.name}')`).all() as Array<{ name: string }>;
    return columns.length === 1 && columns[0]?.name === 'name';
  });
};

const migrateCategoriesForTypeScoping = (database: Database.Database) => {
  const tableInfo = database.prepare(`PRAGMA table_info('categories')`).all() as Array<{ name: string }>;
  const hasTypeColumn = tableInfo.some((column) => column.name === 'type');
  const hasLegacyUnique = hasLegacyUniqueNameConstraint(database);

  if (hasTypeColumn && !hasLegacyUnique) {
    database.exec('CREATE UNIQUE INDEX IF NOT EXISTS categories_name_type_unique_idx ON categories(name, type);');
    return;
  }

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE categories_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT '${DEFAULT_CATEGORY_TYPE}',
      color TEXT NOT NULL DEFAULT '#6366f1',
      icon TEXT NOT NULL DEFAULT 'Folder',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO categories_migrated (id, name, type, color, icon, created_at, updated_at)
    SELECT id, name, ${hasTypeColumn ? 'type' : `'${DEFAULT_CATEGORY_TYPE}'`}, color, icon, created_at, updated_at
    FROM categories;

    DROP TABLE categories;
    ALTER TABLE categories_migrated RENAME TO categories;

    CREATE UNIQUE INDEX IF NOT EXISTS categories_name_type_unique_idx ON categories(name, type);

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
};

const seedDefaultResourceTypes = (database: Database.Database) => {
  const defaultTypes = [
    { id: 'github', name: 'GitHub Repos', icon: 'Github', color: '#333', is_builtin: 1, sort_order: 1 },
    { id: 'skill', name: 'Skills', icon: 'Wrench', color: '#6366f1', is_builtin: 1, sort_order: 2 },
    { id: 'website', name: 'Websites', icon: 'Globe', color: '#10b981', is_builtin: 1, sort_order: 3 },
    { id: 'note', name: 'Notes', icon: 'FileText', color: '#f59e0b', is_builtin: 1, sort_order: 4 },
  ];

  const insertStmt = database.prepare(`
    INSERT OR IGNORE INTO resource_types (id, name, icon, color, is_builtin, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const type of defaultTypes) {
    insertStmt.run(type.id, type.name, type.icon, type.color, type.is_builtin, type.sort_order);
  }
};

const migrateResourcesTable = (database: Database.Database) => {
  const tableInfo = database.prepare(`PRAGMA table_info('resources')`).all() as Array<{ name: string; dflt_value: string | null }>;
  
  if (tableInfo.length === 0) {
    return;
  }

  const tableSql = database.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='resources'`).get() as { sql: string } | undefined;
  
  if (!tableSql || !tableSql.sql.includes('CHECK')) {
    return;
  }

  console.log('Migrating resources table to remove CHECK constraint...');

  database.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;

    CREATE TABLE resources_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      description TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    INSERT INTO resources_new (id, category_id, type, title, url, description, metadata, is_favorite, created_at, updated_at)
    SELECT id, category_id, type, title, url, description, metadata, is_favorite, created_at, updated_at
    FROM resources;

    DROP TABLE resources;
    ALTER TABLE resources_new RENAME TO resources;

    CREATE INDEX IF NOT EXISTS resources_category_idx ON resources(category_id);
    CREATE INDEX IF NOT EXISTS resources_type_idx ON resources(type);
    CREATE INDEX IF NOT EXISTS resources_favorite_idx ON resources(is_favorite);

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);

  console.log('Resources table migration completed');
};

export const initSqliteDb = () => {
  if (db) return db;

  db = new Database('link-manager.db');

  db.exec(createResourceTypesTableSql);
  db.exec(createCategoriesTableSql);

  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
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

  migrateCategoriesForTypeScoping(db);
  migrateResourcesTable(db);
  seedDefaultResourceTypes(db);

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
