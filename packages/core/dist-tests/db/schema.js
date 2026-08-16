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
 * - `extractor_coverage_ledger` Research ledger — logs unhandled AST patterns discovered during repo evaluation.
 *
 * All CREATE TABLE statements use IF NOT EXISTS, making this function safe to call on
 * every startup without migration logic.
 *
 * @param dbPath File path for the SQLite database. Defaults to ':memory:' for tests.
 *               Parent directory is created automatically if it does not exist.
 */
export function initDatabase(dbPath = ':memory:') {
    if (dbPath !== ':memory:') {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      extractor_version TEXT,
      commit_sha TEXT
    );

    CREATE TABLE IF NOT EXISTS structural_entities (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      source_id TEXT,
      target_id TEXT,
      status TEXT,
      confidence TEXT,
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
      FOREIGN KEY (entity_id) REFERENCES structural_entities(id) ON DELETE CASCADE,
      UNIQUE(entity_id, file_path, line_number, evidence_role)
    );

    CREATE TABLE IF NOT EXISTS extractor_coverage_ledger (
      id TEXT PRIMARY KEY,
      pattern_name TEXT NOT NULL,
      framework TEXT DEFAULT 'TypeScript',
      status TEXT CHECK(status IN ('DISCOVERED', 'IN_PROGRESS', 'RESOLVED', 'OUT_OF_SCOPE')) DEFAULT 'DISCOVERED',
      impact_level TEXT CHECK(impact_level IN ('HIGH', 'MEDIUM', 'LOW')) DEFAULT 'MEDIUM',
      evidence_repo TEXT NOT NULL,
      evidence_file TEXT NOT NULL,
      evidence_line INTEGER,
      evidence_snippet TEXT,
      fix_location TEXT,
      fix_pattern_summary TEXT,
      test_fixture_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
    try {
        db.exec("ALTER TABLE structural_entities ADD COLUMN source_id TEXT;");
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE structural_entities ADD COLUMN target_id TEXT;");
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE structural_entities ADD COLUMN status TEXT;");
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE structural_entities ADD COLUMN confidence TEXT;");
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE evidence_records ADD COLUMN evidence_role TEXT;");
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE repositories ADD COLUMN extractor_version TEXT;");
    }
    catch (e) { }
    try {
        db.exec("ALTER TABLE repositories ADD COLUMN commit_sha TEXT;");
    }
    catch (e) { }
    try {
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_dedup ON evidence_records(entity_id, file_path, line_number, evidence_role);");
    }
    catch (e) { }
    return db;
}
