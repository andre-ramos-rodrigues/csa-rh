import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.SQLITE_DB_PATH || './data/app.db';

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const globalForAppDb = global as unknown as {
  sqliteDb: Database.Database | undefined;
  appDbInitialized: boolean | undefined;
};

export const sqliteDb = globalForAppDb.sqliteDb || new Database(DB_PATH);

if (process.env.NODE_ENV !== 'production') {
  globalForAppDb.sqliteDb = sqliteDb;
}

sqliteDb.pragma('journal_mode = WAL');
sqliteDb.pragma('foreign_keys = ON');

// Adiciona uma coluna a uma tabela existente, apenas se ela ainda não existir
function ensureColumn(table: string, column: string, definition: string) {
  const existingColumns = sqliteDb
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];

  const hasColumn = existingColumns.some((col) => col.name === column);

  if (!hasColumn) {
    sqliteDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    console.log(`[db-app] Migração aplicada: ${column} adicionada a ${table}`);
  }
}

export function initAppDb() {
  if (globalForAppDb.appDbInitialized) return;

  // 1. Definições das Tabelas Principais
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_cpf TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      section_key TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'partially_approved')),
      submitted_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      reviewed_by TEXT,
      reviewed_at TEXT,
      review_notes TEXT,
      applied_at TEXT
    );

    CREATE TABLE IF NOT EXISTS change_request_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_request_id INTEGER NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
      resubmission_count INTEGER NOT NULL DEFAULT 0,
      review_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      applied_at TEXT
    );

    CREATE TABLE IF NOT EXISTS change_request_field_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_id INTEGER NOT NULL REFERENCES change_request_fields(id) ON DELETE CASCADE,
      new_value TEXT NOT NULL,
      status TEXT NOT NULL,
      review_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS change_request_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      change_request_id INTEGER NOT NULL REFERENCES change_requests(id) ON DELETE CASCADE,
      field_name TEXT,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      uploaded_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 2. Migrações Defensivas (Sem valores padrão não constantes no ALTER TABLE)
  ensureColumn('change_requests', 'section_key', 'TEXT');
  ensureColumn('change_requests', 'updated_at', 'TEXT');
  ensureColumn('change_request_attachments', 'field_name', 'TEXT');
  ensureColumn('change_requests', 'target_id', 'TEXT');

  // 3. Índices e Restrições Únicas
  sqliteDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_change_requests_status ON change_requests(status);
    CREATE INDEX IF NOT EXISTS idx_change_requests_cpf ON change_requests(employee_cpf);
    CREATE INDEX IF NOT EXISTS idx_change_requests_section ON change_requests(section_key);
    CREATE INDEX IF NOT EXISTS idx_fields_request_id ON change_request_fields(change_request_id);
    CREATE INDEX IF NOT EXISTS idx_fields_status ON change_request_fields(status);
    CREATE INDEX IF NOT EXISTS idx_attachments_request_id ON change_request_attachments(change_request_id);
    CREATE INDEX IF NOT EXISTS idx_field_history_field_id ON change_request_field_history(field_id);

    -- Remove o índice antigo se existir
    DROP INDEX IF EXISTS idx_one_pending_per_cpf;

    -- Garante que o funcionário só tenha 1 solicitação 'pending' por SEÇÃO
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_per_cpf_section
      ON change_requests(employee_cpf, section_key)
      WHERE status = 'pending';
  `);

  globalForAppDb.appDbInitialized = true;
}