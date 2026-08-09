import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  CoverageStatus,
  EntityType,
  EvidenceRecord,
  ExtractorCoverageEntry,
  FixDetailsInput,
  ImpactLevel,
  LedgerSummary,
  LogExtractionGapInput,
  RepresentationGraph,
  StructuralEntity,
} from '../types.js';

export interface RepositoryInfo {
  id: string;
  name: string;
  path: string;
}

export function initDatabase(dbPath: string = ':memory:'): Database.Database {
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
      analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS structural_entities (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS evidence_records (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER,
      snippet TEXT,
      FOREIGN KEY (entity_id) REFERENCES structural_entities(id) ON DELETE CASCADE
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

  return db;
}

export function saveRepresentationGraph(
  db: Database.Database,
  repo: RepositoryInfo,
  graph: RepresentationGraph
): void {
  const saveTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO repositories (id, name, path, analyzed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        analyzed_at = excluded.analyzed_at
    `).run(repo.id, repo.name, repo.path, graph.analyzedAt);

    db.prepare('DELETE FROM structural_entities WHERE repository_id = ?').run(
      repo.id
    );

    const insertEntity = db.prepare(`
      INSERT INTO structural_entities (id, repository_id, name, type)
      VALUES (?, ?, ?, ?)
    `);

    const insertEvidence = db.prepare(`
      INSERT INTO evidence_records (id, entity_id, file_path, line_number, snippet)
      VALUES (?, ?, ?, ?, ?)
    `);

    const allEntities: StructuralEntity[] = [
      ...graph.boundaries,
      ...graph.contracts,
      ...graph.relationships,
      ...graph.openConnectors,
    ];

    let counter = 1;
    for (const entity of allEntities) {
      const globalEntityId = `${repo.id}:${entity.id}`;
      insertEntity.run(globalEntityId, repo.id, entity.name, entity.type);
      if (entity.evidence) {
        const evidenceId = `ev_${repo.id}_${entity.id}_${counter++}`;
        insertEvidence.run(
          evidenceId,
          globalEntityId,
          entity.evidence.filePath,
          entity.evidence.lineNumber ?? null,
          entity.evidence.snippet ?? null
        );
      }
    }
  });

  saveTx();
}

export function getRepresentationGraph(
  db: Database.Database,
  repoId: string
): RepresentationGraph | null {
  const repoRow = db
    .prepare('SELECT id, name, path, analyzed_at FROM repositories WHERE id = ?')
    .get(repoId) as
    | { id: string; name: string; path: string; analyzed_at: string }
    | undefined;

  if (!repoRow) {
    return null;
  }

  const entityRows = db
    .prepare(
      'SELECT id, name, type FROM structural_entities WHERE repository_id = ?'
    )
    .all(repoId) as Array<{ id: string; name: string; type: EntityType }>;

  const evidenceRows = db
    .prepare(
      `
      SELECT er.entity_id, er.file_path, er.line_number, er.snippet
      FROM evidence_records er
      JOIN structural_entities se ON er.entity_id = se.id
      WHERE se.repository_id = ?
    `
    )
    .all(repoId) as Array<{
    entity_id: string;
    file_path: string;
    line_number: number | null;
    snippet: string | null;
  }>;

  const prefix = `${repoId}:`;
  const evidenceMap = new Map<string, EvidenceRecord>();
  for (const row of evidenceRows) {
    const record: EvidenceRecord = {
      filePath: row.file_path,
    };
    if (row.line_number !== null && row.line_number !== undefined) {
      record.lineNumber = row.line_number;
    }
    if (row.snippet !== null && row.snippet !== undefined) {
      record.snippet = row.snippet;
    }
    const cleanEntityId = row.entity_id.startsWith(prefix)
      ? row.entity_id.slice(prefix.length)
      : row.entity_id;
    evidenceMap.set(cleanEntityId, record);
  }

  const boundaries: StructuralEntity[] = [];
  const contracts: StructuralEntity[] = [];
  const relationships: StructuralEntity[] = [];
  const openConnectors: StructuralEntity[] = [];

  for (const row of entityRows) {
    const cleanId = row.id.startsWith(prefix)
      ? row.id.slice(prefix.length)
      : row.id;
    const evidence = evidenceMap.get(cleanId) ?? { filePath: '' };
    const entity: StructuralEntity = {
      id: cleanId,
      name: row.name,
      type: row.type,
      evidence,
    };

    switch (row.type) {
      case 'BOUNDARY':
        boundaries.push(entity);
        break;
      case 'CONTRACT':
        contracts.push(entity);
        break;
      case 'RELATIONSHIP':
        relationships.push(entity);
        break;
      case 'OPEN_CONNECTOR':
        openConnectors.push(entity);
        break;
    }
  }

  return {
    version: '1.0.0',
    analyzedAt: repoRow.analyzed_at,
    boundaries,
    contracts,
    relationships,
    openConnectors,
  };
}

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

