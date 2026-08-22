import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function initLegacyDatabase(dbPath: string = ':memory:'): Database.Database {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  db.exec(`
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
      discovery_type TEXT,
      suggested_evolution TEXT,
      rationale TEXT,
      fix_location TEXT,
      fix_pattern_summary TEXT,
      test_fixture_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try { db.exec("ALTER TABLE extractor_coverage_ledger ADD COLUMN discovery_type TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE extractor_coverage_ledger ADD COLUMN suggested_evolution TEXT;"); } catch (e) {}
  try { db.exec("ALTER TABLE extractor_coverage_ledger ADD COLUMN rationale TEXT;"); } catch (e) {}

  return db;
}
