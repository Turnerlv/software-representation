// packages/core/src/db/ledgerRepository.ts
// CRUD layer for the extractor_coverage_ledger table.
// Used by agents running the parser-eval-harness and parser-builder skills to track
// which AST patterns are missing coverage and whether they have been resolved.

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  CoverageStatus,
  ExtractorCoverageEntry,
  FixDetailsInput,
  ImpactLevel,
  LedgerSummary,
  LogExtractionGapInput,
} from '../types/index.js';

/** Maps a raw SQLite row (snake_case columns) to a typed ExtractorCoverageEntry (camelCase). */
function mapRowToCoverageEntry(row: any): ExtractorCoverageEntry {
  return {
    id: row.id,
    patternName: row.pattern_name,
    framework: row.framework,
    status: row.status as CoverageStatus,
    impactLevel: row.impact_level as ImpactLevel,
    evidenceRepo: row.evidence_repo,
    evidenceFile: row.evidence_file,
    evidenceLine: row.evidence_line ?? null,
    evidenceSnippet: row.evidence_snippet ?? null,
    fixLocation: row.fix_location ?? null,
    fixPatternSummary: row.fix_pattern_summary ?? null,
    testFixturePath: row.test_fixture_path ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Logs a newly discovered AST extraction gap into the coverage ledger.
 *
 * Input normalization: accepts both camelCase (e.g. `patternName`) and snake_case
 * (e.g. `pattern_name`) for every field, to accommodate agent-generated calls.
 * camelCase takes precedence when both are provided.
 *
 * Status defaults to 'DISCOVERED'. ImpactLevel defaults to 'MEDIUM'.
 * A random UUID is generated for `id` if none is provided.
 *
 * @throws If patternName, evidenceRepo, or evidenceFile are missing from the input.
 */
export function logExtractionGap(
  db: Database.Database,
  gapData: LogExtractionGapInput
): ExtractorCoverageEntry {
  const id = gapData.id ?? `gap_${randomUUID()}`;
  const patternName = gapData.patternName ?? gapData.pattern_name;
  if (!patternName) {
    throw new Error('patternName (or pattern_name) is required');
  }

  const framework = gapData.framework ?? 'TypeScript';
  const status: CoverageStatus = gapData.status ?? 'DISCOVERED';
  const impactLevel: ImpactLevel =
    gapData.impactLevel ?? gapData.impact_level ?? 'MEDIUM';
  const evidenceRepo = gapData.evidenceRepo ?? gapData.evidence_repo;
  if (!evidenceRepo) {
    throw new Error('evidenceRepo (or evidence_repo) is required');
  }

  const evidenceFile = gapData.evidenceFile ?? gapData.evidence_file;
  if (!evidenceFile) {
    throw new Error('evidenceFile (or evidence_file) is required');
  }

  const evidenceLine = gapData.evidenceLine ?? gapData.evidence_line ?? null;
  const evidenceSnippet =
    gapData.evidenceSnippet ?? gapData.evidence_snippet ?? null;
  const fixLocation = gapData.fixLocation ?? gapData.fix_location ?? null;
  const fixPatternSummary =
    gapData.fixPatternSummary ?? gapData.fix_pattern_summary ?? null;
  const testFixturePath =
    gapData.testFixturePath ?? gapData.test_fixture_path ?? null;

  const stmt = db.prepare(`
    INSERT INTO extractor_coverage_ledger (
      id, pattern_name, framework, status, impact_level,
      evidence_repo, evidence_file, evidence_line, evidence_snippet,
      fix_location, fix_pattern_summary, test_fixture_path
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  stmt.run(
    id,
    patternName,
    framework,
    status,
    impactLevel,
    evidenceRepo,
    evidenceFile,
    evidenceLine,
    evidenceSnippet,
    fixLocation,
    fixPatternSummary,
    testFixturePath
  );

  const row = db
    .prepare('SELECT * FROM extractor_coverage_ledger WHERE id = ?')
    .get(id);

  return mapRowToCoverageEntry(row);
}

/**
 * Transitions a ledger entry from any status to 'RESOLVED' and records the fix details.
 *
 * fixLocation and fixPatternSummary are required — RESOLVED entries must be fully traceable.
 * testFixturePath is optional but strongly recommended.
 *
 * @returns The updated entry, or null if no entry with the given gapId exists.
 * @throws If fixLocation or fixPatternSummary are missing.
 */
export function resolveExtractionGap(
  db: Database.Database,
  gapId: string,
  fixDetails: FixDetailsInput
): ExtractorCoverageEntry | null {
  const fixLocation = fixDetails.fixLocation ?? fixDetails.fix_location;
  if (!fixLocation) {
    throw new Error('fixLocation (or fix_location) is required');
  }

  const fixPatternSummary =
    fixDetails.fixPatternSummary ?? fixDetails.fix_pattern_summary;
  if (!fixPatternSummary) {
    throw new Error('fixPatternSummary (or fix_pattern_summary) is required');
  }

  const testFixturePath =
    fixDetails.testFixturePath ?? fixDetails.test_fixture_path ?? null;

  const stmt = db.prepare(`
    UPDATE extractor_coverage_ledger
    SET status = 'RESOLVED',
        fix_location = ?,
        fix_pattern_summary = ?,
        test_fixture_path = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const result = stmt.run(
    fixLocation,
    fixPatternSummary,
    testFixturePath,
    gapId
  );

  if (result.changes === 0) {
    return null;
  }

  const row = db
    .prepare('SELECT * FROM extractor_coverage_ledger WHERE id = ?')
    .get(gapId);

  return mapRowToCoverageEntry(row);
}

/**
 * Returns an aggregate summary of the extractor coverage ledger.
 * Used by `chomp ledger` to display resolution progress and breakdown by status,
 * framework, and impact level.
 */
export function getLedgerSummary(db: Database.Database): LedgerSummary {
  const totalRow = db
    .prepare('SELECT COUNT(*) as count FROM extractor_coverage_ledger')
    .get() as { count: number };
  const totalPatterns = totalRow.count;

  const resolvedRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM extractor_coverage_ledger WHERE status = 'RESOLVED'"
    )
    .get() as { count: number };
  const resolvedCount = resolvedRow.count;

  const resolvedPercentage =
    totalPatterns === 0
      ? 0
      : Number(((resolvedCount / totalPatterns) * 100).toFixed(2));

  const byStatus: Record<CoverageStatus, number> = {
    DISCOVERED: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    OUT_OF_SCOPE: 0,
  };
  const statusRows = db
    .prepare(
      'SELECT status, COUNT(*) as count FROM extractor_coverage_ledger GROUP BY status'
    )
    .all() as Array<{ status: CoverageStatus; count: number }>;
  for (const r of statusRows) {
    if (r.status in byStatus) {
      byStatus[r.status] = r.count;
    }
  }

  const byFramework: Record<string, number> = {};
  const frameworkRows = db
    .prepare(
      'SELECT framework, COUNT(*) as count FROM extractor_coverage_ledger GROUP BY framework'
    )
    .all() as Array<{ framework: string; count: number }>;
  for (const r of frameworkRows) {
    byFramework[r.framework] = r.count;
  }

  const byImpactLevel: Record<ImpactLevel, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  const impactRows = db
    .prepare(
      'SELECT impact_level, COUNT(*) as count FROM extractor_coverage_ledger GROUP BY impact_level'
    )
    .all() as Array<{ impact_level: ImpactLevel; count: number }>;
  for (const r of impactRows) {
    if (r.impact_level in byImpactLevel) {
      byImpactLevel[r.impact_level] = r.count;
    }
  }

  return {
    totalPatterns,
    resolvedCount,
    resolvedPercentage,
    byStatus,
    byFramework,
    byImpactLevel,
  };
}

/**
 * Returns all ledger entries ordered by most recently created first.
 * Used by `chomp ledger` to render the full coverage table.
 */
export function getAllLedgerEntries(
  db: Database.Database
): ExtractorCoverageEntry[] {
  const rows = db
    .prepare(
      'SELECT * FROM extractor_coverage_ledger ORDER BY created_at DESC, id DESC'
    )
    .all();

  return rows.map(mapRowToCoverageEntry);
}
