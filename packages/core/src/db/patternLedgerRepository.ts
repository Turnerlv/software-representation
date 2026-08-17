// packages/core/src/db/patternLedgerRepository.ts
//
// Pattern Ledger — one row per pattern CLASS (a syntactic shape), not per occurrence.
// Used by `chomp inventory` sweeps and comparison sessions.
//
// Distinct from the old extractor_coverage_ledger:
//   - Coverage gaps (unknown shapes) → here
//   - Correctness bugs (wrong output for known shapes) → bugTrackerRepository.ts

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/** Valid ontology categories per the 3+1 model. */
export type OntologyCategory = 'BOUNDARY' | 'CONTRACT' | 'RELATIONSHIP' | 'OPEN_CONNECTOR';

/** Lifecycle status of a pattern class. */
export type PatternStatus = 'unhandled' | 'partial' | 'handled';

export interface PatternEntry {
  pattern_id: string;
  ontology_category: OntologyCategory;
  description: string;
  detection_signature: string | null;
  status: PatternStatus;
  first_seen_repo: string | null;
  first_seen_session_id: string | null;
  first_seen_file: string | null;
  first_seen_line: number | null;
  occurrence_count: number;
  resolving_session_id: string | null;
  resolving_commit: string | null;
  created_at: string;
  updated_at: string;
}

export interface LogPatternInput {
  pattern_id: string;
  ontology_category: OntologyCategory;
  description: string;
  detection_signature?: string | null;
  status?: PatternStatus;
  first_seen_repo?: string | null;
  first_seen_session_id?: string | null;
  first_seen_file?: string | null;
  first_seen_line?: number | null;
}

export interface PatternSummary {
  total: number;
  by_status: Record<PatternStatus, number>;
  by_category: Record<OntologyCategory, number>;
}

/**
 * Opens (or creates) the pattern ledger database at the given path.
 * Safe to call on every startup — uses CREATE TABLE IF NOT EXISTS.
 */
export function initPatternLedger(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS pattern_ledger (
      pattern_id          TEXT PRIMARY KEY,
      ontology_category   TEXT NOT NULL CHECK(ontology_category IN ('BOUNDARY','CONTRACT','RELATIONSHIP','OPEN_CONNECTOR')),
      description         TEXT NOT NULL,
      detection_signature TEXT,
      status              TEXT NOT NULL DEFAULT 'unhandled' CHECK(status IN ('unhandled','partial','handled')),
      first_seen_repo     TEXT,
      first_seen_session_id TEXT,
      first_seen_file     TEXT,
      first_seen_line     INTEGER,
      occurrence_count    INTEGER NOT NULL DEFAULT 0,
      resolving_session_id TEXT,
      resolving_commit    TEXT,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

/**
 * Inserts a new pattern class into the ledger.
 * Throws if the pattern_id already exists (use updatePattern to modify).
 */
export function logPattern(db: Database.Database, input: LogPatternInput): PatternEntry {
  const stmt = db.prepare(`
    INSERT INTO pattern_ledger (
      pattern_id, ontology_category, description, detection_signature,
      status, first_seen_repo, first_seen_session_id, first_seen_file, first_seen_line
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    input.pattern_id,
    input.ontology_category,
    input.description,
    input.detection_signature ?? null,
    input.status ?? 'unhandled',
    input.first_seen_repo ?? null,
    input.first_seen_session_id ?? null,
    input.first_seen_file ?? null,
    input.first_seen_line ?? null,
  );

  return getPattern(db, input.pattern_id)!;
}

/**
 * Increment (or set) the occurrence count for a pattern after a sweep.
 * Also updates detection_signature if a refined version is provided.
 */
export function updatePatternOccurrence(
  db: Database.Database,
  patternId: string,
  occurrenceCount: number,
  detectionSignature?: string,
): void {
  if (detectionSignature !== undefined) {
    db.prepare(`
      UPDATE pattern_ledger
      SET occurrence_count = ?, detection_signature = ?, updated_at = CURRENT_TIMESTAMP
      WHERE pattern_id = ?
    `).run(occurrenceCount, detectionSignature, patternId);
  } else {
    db.prepare(`
      UPDATE pattern_ledger
      SET occurrence_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE pattern_id = ?
    `).run(occurrenceCount, patternId);
  }
}

/**
 * Mark a pattern as resolved, recording the session and commit that fixed it.
 */
export function resolvePattern(
  db: Database.Database,
  patternId: string,
  sessionId: string,
  commit?: string,
): PatternEntry | null {
  const result = db.prepare(`
    UPDATE pattern_ledger
    SET status = 'handled', resolving_session_id = ?, resolving_commit = ?, updated_at = CURRENT_TIMESTAMP
    WHERE pattern_id = ?
  `).run(sessionId, commit ?? null, patternId);

  if (result.changes === 0) return null;
  return getPattern(db, patternId);
}

/** Update only the status of a pattern (e.g. unhandled → partial). */
export function updatePatternStatus(
  db: Database.Database,
  patternId: string,
  status: PatternStatus,
): void {
  db.prepare(`
    UPDATE pattern_ledger SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE pattern_id = ?
  `).run(status, patternId);
}

/** Fetch a single pattern entry by ID. Returns null if not found. */
export function getPattern(db: Database.Database, patternId: string): PatternEntry | null {
  const row = db.prepare('SELECT * FROM pattern_ledger WHERE pattern_id = ?').get(patternId) as PatternEntry | undefined;
  return row ?? null;
}

/** Returns all pattern entries ordered by status then pattern_id. */
export function getAllPatterns(db: Database.Database): PatternEntry[] {
  return db.prepare(
    `SELECT * FROM pattern_ledger ORDER BY
      CASE status WHEN 'unhandled' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
      pattern_id`
  ).all() as PatternEntry[];
}

/**
 * Returns only patterns that have a detection_signature set —
 * these are the ones `chomp inventory` can sweep for.
 */
export function getSweepablePatterns(db: Database.Database): PatternEntry[] {
  return db.prepare(
    'SELECT * FROM pattern_ledger WHERE detection_signature IS NOT NULL ORDER BY pattern_id'
  ).all() as PatternEntry[];
}

/** Aggregate summary for display. */
export function getPatternSummary(db: Database.Database): PatternSummary {
  const totalRow = db.prepare('SELECT COUNT(*) as c FROM pattern_ledger').get() as { c: number };

  const byStatus: Record<PatternStatus, number> = { unhandled: 0, partial: 0, handled: 0 };
  for (const r of db.prepare('SELECT status, COUNT(*) as c FROM pattern_ledger GROUP BY status').all() as any[]) {
    if (r.status in byStatus) byStatus[r.status as PatternStatus] = r.c;
  }

  const byCategory: Record<OntologyCategory, number> = {
    BOUNDARY: 0, CONTRACT: 0, RELATIONSHIP: 0, OPEN_CONNECTOR: 0,
  };
  for (const r of db.prepare('SELECT ontology_category, COUNT(*) as c FROM pattern_ledger GROUP BY ontology_category').all() as any[]) {
    if (r.ontology_category in byCategory) byCategory[r.ontology_category as OntologyCategory] = r.c;
  }

  return { total: totalRow.c, by_status: byStatus, by_category: byCategory };
}
