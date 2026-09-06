import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Initializes the Chomp SQLite database and ensures all tables exist.
 *
 * Schema overview:
 * - `repositories`             One row per analyzed repo (upserted on re-run).
 * - `structural_entities`      One row per extracted primitive (BOUNDARY / CONTRACT / RELATIONSHIP / OPEN_CONNECTOR).
 *                              Cascade-deleted when the parent repository is removed.
 * - `evidence_records`         One row per entity linking back to its exact source file + line.
 *                              Cascade-deleted when the parent entity is removed.
 *
 * All CREATE TABLE statements use IF NOT EXISTS, making this function safe to call on
 * every startup without migration logic.
 *
 * @param dbPath File path for the SQLite database. Defaults to ':memory:' for tests.
 *               Parent directory is created automatically if it does not exist.
 */
export function initDatabase(dbPath: string = ':memory:'): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      extractor_version TEXT,
      commit_sha TEXT,
      branch_name TEXT,
      project_id TEXT
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'UNKNOWN',
      pattern_id TEXT NOT NULL DEFAULT 'UNKNOWN',
      scope TEXT NOT NULL DEFAULT 'USER',
      parent_boundary_id TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'UNKNOWN',
      pattern_id TEXT NOT NULL DEFAULT 'UNKNOWN',
      scope TEXT NOT NULL DEFAULT 'USER',
      source_id TEXT NOT NULL,
      target_id TEXT,
      status TEXT,
      confidence TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS evidence_records (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER,
      snippet TEXT,
      evidence_role TEXT,
      UNIQUE(entity_id, file_path, line_number, evidence_role)
    );

  `);

  try { db.exec("ALTER TABLE nodes ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'UNKNOWN';"); } catch (e) { }
  try { db.exec("ALTER TABLE nodes ADD COLUMN pattern_id TEXT NOT NULL DEFAULT 'UNKNOWN';"); } catch (e) { }
  try { db.exec("ALTER TABLE nodes ADD COLUMN scope TEXT NOT NULL DEFAULT 'USER';"); } catch (e) { }
  try { db.exec("ALTER TABLE nodes ADD COLUMN parent_boundary_id TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE nodes ADD COLUMN metadata TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE edges ADD COLUMN source_id TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE edges ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'UNKNOWN';"); } catch (e) { }
  try { db.exec("ALTER TABLE edges ADD COLUMN pattern_id TEXT NOT NULL DEFAULT 'UNKNOWN';"); } catch (e) { }
  try { db.exec("ALTER TABLE edges ADD COLUMN scope TEXT NOT NULL DEFAULT 'USER';"); } catch (e) { }
  try { db.exec("ALTER TABLE edges ADD COLUMN target_id TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE edges ADD COLUMN status TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE edges ADD COLUMN confidence TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE edges ADD COLUMN metadata TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE evidence_records ADD COLUMN evidence_role TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE repositories ADD COLUMN extractor_version TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE repositories ADD COLUMN commit_sha TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE repositories ADD COLUMN branch_name TEXT;"); } catch (e) { }
  try { db.exec("ALTER TABLE repositories ADD COLUMN project_id TEXT;"); } catch (e) { }
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_dedup ON evidence_records(entity_id, file_path, line_number, evidence_role);"); } catch (e) { }

  return db;
}
