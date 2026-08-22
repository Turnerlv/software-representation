// packages/core/src/db/bugTrackerRepository.ts
//
// Bug Tracker — one row per DEFECT in an already-handled pattern.
// Correctness bugs (e.g. duplicate evidence records, wrong entity type assigned)
// live here, NOT in the pattern_ledger.
//
// Separation rule:
//   pattern_ledger → "extractor doesn't know this shape exists"
//   bug_tracker    → "extractor knows the shape but produces wrong output"

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export type BugStatus = 'open' | 'investigating' | 'fixed' | 'wontfix';

export interface BugEntry {
  bug_id: string;
  description: string;
  repo: string;
  file: string;
  line: number | null;
  found_session_id: string;
  status: BugStatus;
  fixed_session_id: string | null;
  fixed_commit: string | null;
  created_at: string;
  updated_at: string;
}

export interface LogBugInput {
  bug_id: string;
  description: string;
  repo: string;
  file: string;
  line?: number | null;
  found_session_id: string;
}

export interface BugSummary {
  total: number;
  by_status: Record<BugStatus, number>;
}

/**
 * Opens (or creates) the bug tracker database at the given path.
 * Safe to call on every startup — uses CREATE TABLE IF NOT EXISTS.
 */
export function initBugTracker(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS bug_tracker (
      bug_id          TEXT PRIMARY KEY,
      description     TEXT NOT NULL,
      repo            TEXT NOT NULL,
      file            TEXT NOT NULL,
      line            INTEGER,
      found_session_id TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','investigating','fixed','wontfix')),
      fixed_session_id TEXT,
      fixed_commit    TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

/**
 * Logs a new correctness defect into the bug tracker.
 * Throws if the bug_id already exists.
 */
export function logBug(db: Database.Database, input: LogBugInput): BugEntry {
  db.prepare(`
    INSERT INTO bug_tracker (bug_id, description, repo, file, line, found_session_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.bug_id,
    input.description,
    input.repo,
    input.file,
    input.line ?? null,
    input.found_session_id,
  );

  return getBug(db, input.bug_id)!;
}

/**
 * Updates a bug's status. Optionally records the fixing session and commit
 * when transitioning to 'fixed'.
 */
export function updateBugStatus(
  db: Database.Database,
  bugId: string,
  status: BugStatus,
  fixedSessionId?: string,
  fixedCommit?: string,
): BugEntry | null {
  const result = db.prepare(`
    UPDATE bug_tracker
    SET status = ?, fixed_session_id = ?, fixed_commit = ?, updated_at = CURRENT_TIMESTAMP
    WHERE bug_id = ?
  `).run(status, fixedSessionId ?? null, fixedCommit ?? null, bugId);

  if (result.changes === 0) return null;
  return getBug(db, bugId);
}

/** Fetch a single bug by ID. Returns null if not found. */
export function getBug(db: Database.Database, bugId: string): BugEntry | null {
  const row = db.prepare('SELECT * FROM bug_tracker WHERE bug_id = ?').get(bugId) as BugEntry | undefined;
  return row ?? null;
}

/** Returns all bug entries ordered by status (open first) then bug_id. */
export function getAllBugs(db: Database.Database): BugEntry[] {
  return db.prepare(
    `SELECT * FROM bug_tracker ORDER BY
      CASE status WHEN 'open' THEN 0 WHEN 'investigating' THEN 1 WHEN 'fixed' THEN 2 ELSE 3 END,
      bug_id`
  ).all() as BugEntry[];
}

/** Returns only open bugs. */
export function getOpenBugs(db: Database.Database): BugEntry[] {
  return db.prepare(
    "SELECT * FROM bug_tracker WHERE status IN ('open','investigating') ORDER BY bug_id"
  ).all() as BugEntry[];
}

/** Aggregate summary for display. */
export function getBugSummary(db: Database.Database): BugSummary {
  const totalRow = db.prepare('SELECT COUNT(*) as c FROM bug_tracker').get() as { c: number };

  const byStatus: Record<BugStatus, number> = { open: 0, investigating: 0, fixed: 0, wontfix: 0 };
  for (const r of db.prepare('SELECT status, COUNT(*) as c FROM bug_tracker GROUP BY status').all() as any[]) {
    if (r.status in byStatus) byStatus[r.status as BugStatus] = r.c;
  }

  return { total: totalRow.c, by_status: byStatus };
}
