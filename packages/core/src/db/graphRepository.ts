// packages/core/src/db/graphRepository.ts
// Persistence layer for RepresentationGraph — save and retrieve structural entities per repository.

import Database from 'better-sqlite3';
import {
  EntityType,
  EvidenceRecord,
  RepresentationGraph,
  StructuralEntity,
} from '../types/index.js';

/** Minimal repo metadata required to persist a RepresentationGraph. */
export interface RepositoryInfo {
  /** Stable kebab-case identifier derived from the repo directory name. */
  id: string;
  name: string;
  /** Absolute path to the repo root on disk. */
  path: string;
  /** Version of @chomp/core that extracted this representation. */
  extractorVersion?: string;
  /** Git commit SHA of the repository state at extraction time. */
  commitSha?: string;
}

import { createHash } from 'crypto';

/**
 * Persists a RepresentationGraph to the database under the given repository.
 *
 * Strategy:
 * - Upserts the repository row (safe to call repeatedly on re-runs).
 * - Deletes all existing structural_entities for this repo (cascades to evidence_records).
 * - Re-inserts all entities from the new graph in a single transaction.
 *
 * Entity IDs stored in the DB are namespaced as `${repoId}:${entity.id}` to prevent
 * collisions when multiple repos are stored in the same database file.
 */
export function saveRepresentationGraph(
  db: Database.Database,
  repo: RepositoryInfo,
  graph: RepresentationGraph
): void {
  const saveTx = db.transaction(() => {
    db.prepare(`
      INSERT INTO repositories (id, name, path, analyzed_at, extractor_version, commit_sha)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        analyzed_at = excluded.analyzed_at,
        extractor_version = excluded.extractor_version,
        commit_sha = excluded.commit_sha
    `).run(repo.id, repo.name, repo.path, graph.analyzedAt, repo.extractorVersion ?? null, repo.commitSha ?? null);

    db.prepare('DELETE FROM structural_entities WHERE repository_id = ?').run(
      repo.id
    );

    const insertEntity = db.prepare(`
      INSERT OR IGNORE INTO structural_entities (id, repository_id, name, type, source_id, target_id, status, confidence, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEvidence = db.prepare(`
      INSERT OR IGNORE INTO evidence_records (id, entity_id, file_path, line_number, snippet, evidence_role)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const allEntities: StructuralEntity[] = [
      ...graph.boundaries,
      ...graph.contracts,
      ...graph.relationships,
      ...graph.openConnectors,
    ];

    for (const entity of allEntities) {
      const globalEntityId = `${repo.id}:${entity.id}`;
      const metadataStr = entity.metadata ? JSON.stringify(entity.metadata) : null;
      insertEntity.run(globalEntityId, repo.id, entity.name, entity.type, entity.sourceId ?? null, entity.targetId ?? null, entity.status ?? null, entity.confidence ?? null, metadataStr);
      
      const evidences = Array.isArray(entity.evidence) ? entity.evidence : [entity.evidence];
      for (const ev of evidences) {
        if (ev) {
          const evidenceHashInput = `${globalEntityId}:${ev.filePath}:${ev.lineNumber ?? ''}:${ev.evidenceRole ?? ''}`;
          const evidenceHash = createHash('sha256').update(evidenceHashInput).digest('hex').slice(0, 16);
          const evidenceId = `ev_${evidenceHash}`;
          insertEvidence.run(
            evidenceId,
            globalEntityId,
            ev.filePath,
            ev.lineNumber ?? null,
            ev.snippet ?? null,
            ev.evidenceRole ?? null
          );
        }
      }
    }
  });

  saveTx();
}

/**
 * Retrieves a previously saved RepresentationGraph for the given repository.
 *
 * Reconstructs the full graph from the three DB tables (repositories, structural_entities, evidence_records).
 * Entity IDs are de-namespaced on read — the stored `${repoId}:${entity.id}` prefix is stripped
 * so callers receive the original stable content-hash IDs.
 *
 * @returns The RepresentationGraph, or null if the repository has not been analyzed yet.
 */
export function getRepresentationGraph(
  db: Database.Database,
  repoId: string
): RepresentationGraph | null {
  const repoRow = db
    .prepare('SELECT id, name, path, analyzed_at, extractor_version, commit_sha FROM repositories WHERE id = ?')
    .get(repoId) as
    | { id: string; name: string; path: string; analyzed_at: string; extractor_version: string | null; commit_sha: string | null }
    | undefined;

  if (!repoRow) {
    return null;
  }

  const entityRows = db
    .prepare(
      'SELECT id, name, type, source_id, target_id, status, confidence, metadata FROM structural_entities WHERE repository_id = ?'
    )
    .all(repoId) as Array<{ id: string; name: string; type: EntityType; source_id: string | null; target_id: string | null; status: 'DETERMINISTIC' | 'INFERRED' | null; confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null; metadata: string | null }>;

  const evidenceRows = db
    .prepare(
      `
      SELECT er.entity_id, er.file_path, er.line_number, er.snippet, er.evidence_role
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
    evidence_role: 'syntax-call' | 'import-match' | 'target-signature' | null;
  }>;

  const prefix = `${repoId}:`;
  const evidenceMap = new Map<string, EvidenceRecord[]>();
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
    if (row.evidence_role !== null && row.evidence_role !== undefined) {
      record.evidenceRole = row.evidence_role;
    }
    const cleanEntityId = row.entity_id.startsWith(prefix)
      ? row.entity_id.slice(prefix.length)
      : row.entity_id;
      
    if (!evidenceMap.has(cleanEntityId)) {
      evidenceMap.set(cleanEntityId, []);
    }
    evidenceMap.get(cleanEntityId)!.push(record);
  }

  const boundaries: StructuralEntity[] = [];
  const contracts: StructuralEntity[] = [];
  const relationships: StructuralEntity[] = [];
  const openConnectors: StructuralEntity[] = [];

  for (const row of entityRows) {
    const cleanId = row.id.startsWith(prefix)
      ? row.id.slice(prefix.length)
      : row.id;
    const evidenceArray = evidenceMap.get(cleanId) ?? [];
    const evidence = evidenceArray.length === 1 ? evidenceArray[0] : (evidenceArray.length > 1 ? evidenceArray : { filePath: '' });
    const entity: StructuralEntity = {
      id: cleanId,
      name: row.name,
      type: row.type,
      evidence,
    };
    
    if (row.source_id) entity.sourceId = row.source_id;
    if (row.target_id) entity.targetId = row.target_id;
    if (row.status) entity.status = row.status;
    if (row.confidence) entity.confidence = row.confidence;
    if (row.metadata) {
      try {
        entity.metadata = JSON.parse(row.metadata);
      } catch (e) {
        // Fallback for corrupted JSON, though shouldn't happen
      }
    }

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

  const result: RepresentationGraph = {
    version: repoRow.extractor_version ?? '1.0.0',
    analyzedAt: repoRow.analyzed_at,
    boundaries,
    contracts,
    relationships,
    openConnectors,
  };

  if (repoRow.commit_sha) {
    result.commitSha = repoRow.commit_sha;
  }

  return result;
}
