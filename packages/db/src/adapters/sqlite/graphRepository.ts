// packages/core/src/db/graphRepository.ts
// Persistence layer for RepresentationGraph — save and retrieve structural entities per repository.

import Database from 'better-sqlite3';
import {
  EntityType,
  EvidenceRecord,
  RepresentationGraph,
  StructuralNode,
  StructuralEdge,
} from '@chomp/core';

import { RepositoryInfo, ScopeOptions } from '../../interface.js';

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
      INSERT INTO repositories (id, name, path, analyzed_at, extractor_version, commit_sha, branch_name, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        analyzed_at = excluded.analyzed_at,
        extractor_version = excluded.extractor_version,
        commit_sha = excluded.commit_sha,
        branch_name = excluded.branch_name,
        project_id = excluded.project_id
    `).run(repo.id, repo.name, repo.path, graph.analyzedAt, repo.extractorVersion ?? null, repo.commitSha ?? null, repo.branchName ?? null, repo.projectId ?? null);

    db.prepare('DELETE FROM nodes WHERE repository_id = ?').run(repo.id);
    db.prepare('DELETE FROM edges WHERE repository_id = ?').run(repo.id);

    const insertNode = db.prepare(`
      INSERT OR IGNORE INTO nodes (id, repository_id, name, type, entity_type, pattern_id, scope, parent_boundary_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEdge = db.prepare(`
      INSERT OR IGNORE INTO edges (id, repository_id, name, type, entity_type, pattern_id, scope, source_id, target_id, status, confidence, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEvidence = db.prepare(`
      INSERT OR IGNORE INTO evidence_records (id, entity_id, file_path, line_number, snippet, evidence_role)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const node of graph.nodes) {
      const metadataStr = node.metadata ? JSON.stringify(node.metadata) : null;
      insertNode.run(node.id, repo.id, node.name, node.type, node.entityType, node.patternId, node.scope ?? 'USER', node.parentBoundaryId ?? null, metadataStr);
      
      const evidences = Array.isArray(node.evidence) ? node.evidence : [node.evidence];
      for (const ev of evidences) {
        if (ev) {
          const evidenceHashInput = `${node.id}:${ev.filePath}:${ev.lineNumber ?? ''}:${ev.evidenceRole ?? ''}`;
          const evidenceHash = createHash('sha256').update(evidenceHashInput).digest('hex').slice(0, 16);
          const evidenceId = `ev_${evidenceHash}`;
          insertEvidence.run(
            evidenceId,
            node.id,
            ev.filePath,
            ev.lineNumber ?? null,
            ev.snippet ?? null,
            ev.evidenceRole ?? null
          );
        }
      }
    }

    for (const edge of graph.edges) {
      const metadataStr = edge.metadata ? JSON.stringify(edge.metadata) : null;
      insertEdge.run(edge.id, repo.id, edge.name, edge.type, edge.entityType, edge.patternId, edge.scope ?? 'USER', edge.sourceId, edge.targetId ?? null, edge.status ?? null, edge.confidence ?? null, metadataStr);
      
      const evidences = Array.isArray(edge.evidence) ? edge.evidence : [edge.evidence];
      for (const ev of evidences) {
        if (ev) {
          const evidenceHashInput = `${edge.id}:${ev.filePath}:${ev.lineNumber ?? ''}:${ev.evidenceRole ?? ''}`;
          const evidenceHash = createHash('sha256').update(evidenceHashInput).digest('hex').slice(0, 16);
          const evidenceId = `ev_${evidenceHash}`;
          insertEvidence.run(
            evidenceId,
            edge.id,
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
  repoId: string,
  options: ScopeOptions = { scopes: ['USER'] }
): RepresentationGraph | null {
  const repoRow = db
    .prepare('SELECT id, name, path, analyzed_at, extractor_version, commit_sha, branch_name, project_id FROM repositories WHERE id = ?')
    .get(repoId) as
    | { id: string; name: string; path: string; analyzed_at: string; extractor_version: string | null; commit_sha: string | null; branch_name: string | null; project_id: string | null }
    | undefined;

  if (!repoRow) {
    return null;
  }

  const scopesStr = options.scopes?.length ? options.scopes.map(s => `'${s}'`).join(',') : "'USER'";
  const nodeRows = db
    .prepare(
      `SELECT id, name, type, entity_type, pattern_id, scope, parent_boundary_id, metadata FROM nodes WHERE repository_id = ? AND scope IN (${scopesStr})`
    )
    .all(repoId) as Array<{ id: string; name: string; type: EntityType; entity_type: string; pattern_id: string; scope: 'USER' | 'TEST' | 'MOCK' | 'CONFIG'; parent_boundary_id: string | null; metadata: string | null }>;

  const edgeRows = db
    .prepare(
      `SELECT id, name, type, entity_type, pattern_id, scope, source_id, target_id, status, confidence, metadata FROM edges WHERE repository_id = ? AND scope IN (${scopesStr})`
    )
    .all(repoId) as Array<{ id: string; name: string; type: EntityType; entity_type: string; pattern_id: string; scope: 'USER' | 'TEST' | 'MOCK' | 'CONFIG'; source_id: string; target_id: string | null; status: 'DETERMINISTIC' | 'INFERRED' | null; confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null; metadata: string | null }>;

  const evidenceRows = db
    .prepare(
      `
      SELECT er.entity_id, er.file_path, er.line_number, er.snippet, er.evidence_role
      FROM evidence_records er
      JOIN nodes n ON er.entity_id = n.id WHERE n.repository_id = ?
      UNION
      SELECT er.entity_id, er.file_path, er.line_number, er.snippet, er.evidence_role
      FROM evidence_records er
      JOIN edges e ON er.entity_id = e.id WHERE e.repository_id = ?
    `
    )
    .all(repoId, repoId) as Array<{
    entity_id: string;
    file_path: string;
    line_number: number | null;
    snippet: string | null;
    evidence_role: 'syntax-call' | 'import-match' | 'target-signature' | null;
  }>;

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
    const cleanEntityId = row.entity_id;
      
    if (!evidenceMap.has(cleanEntityId)) {
      evidenceMap.set(cleanEntityId, []);
    }
    evidenceMap.get(cleanEntityId)!.push(record);
  }

  const nodes: StructuralNode[] = [];
  const edges: StructuralEdge[] = [];

  for (const row of nodeRows) {
    const cleanId = row.id;
    const evidenceArray = evidenceMap.get(cleanId) ?? [];
    const evidence = evidenceArray.length === 1 ? evidenceArray[0] : (evidenceArray.length > 1 ? evidenceArray : { filePath: '' });
    const node: StructuralNode = {
      id: cleanId,
      name: row.name,
      type: row.type as 'BOUNDARY' | 'CONTRACT' | 'OPEN_CONNECTOR',
      entityType: row.entity_type,
      patternId: row.pattern_id,
      scope: row.scope,
      evidence,
    };
    
    if (row.parent_boundary_id) node.parentBoundaryId = row.parent_boundary_id;
    if (row.metadata) {
      try {
        node.metadata = JSON.parse(row.metadata);
      } catch (e) {}
    }
    nodes.push(node);
  }

  for (const row of edgeRows) {
    const cleanId = row.id;
    const evidenceArray = evidenceMap.get(cleanId) ?? [];
    const evidence = evidenceArray.length === 1 ? evidenceArray[0] : (evidenceArray.length > 1 ? evidenceArray : { filePath: '' });
    const edge: StructuralEdge = {
      id: cleanId,
      name: row.name,
      type: row.type as 'RELATIONSHIP',
      entityType: row.entity_type,
      patternId: row.pattern_id,
      scope: row.scope,
      evidence,
      sourceId: row.source_id,
    };
    
    if (row.target_id) edge.targetId = row.target_id;
    if (row.status) edge.status = row.status as any;
    if (row.confidence) edge.confidence = row.confidence as any;
    if (row.metadata) {
      try {
        edge.metadata = JSON.parse(row.metadata);
      } catch (e) {}
    }
    edges.push(edge);
  }

  const result: RepresentationGraph = {
    extractorVersion: repoRow.extractor_version ?? '1.0.0',
    analyzedAt: repoRow.analyzed_at,
    nodes,
    edges,
  };

  if (repoRow.commit_sha) {
    result.commitSha = repoRow.commit_sha;
  }
  if (repoRow.branch_name) {
    result.branchName = repoRow.branch_name;
  }

  return result;
}

export function listRepositories(db: Database.Database): Promise<RepositoryInfo[]> {
  const rows = db.prepare('SELECT id, name, path, analyzed_at, extractor_version, commit_sha, branch_name, project_id FROM repositories').all();
  // Map the snake_case DB columns back to the camelCase RepositoryInfo interface
  const repos = rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    path: row.path,
    analyzedAt: row.analyzed_at,
    extractorVersion: row.extractor_version,
    commitSha: row.commit_sha,
    branchName: row.branch_name,
    projectId: row.project_id
  }));
  return Promise.resolve(repos);
}

