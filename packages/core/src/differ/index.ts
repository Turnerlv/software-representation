import { RepresentationGraph, StructuralNode, StructuralEdge, EvidenceRecord } from "../types/ontology.js";

export type DiffStatus = 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED' | 'LEXICAL_SHIFT';

export interface DiffNode extends StructuralNode {
  diffStatus: DiffStatus;
}

export interface DiffEdge extends StructuralEdge {
  diffStatus: DiffStatus;
}

export interface IntentDiff {
  nodes: DiffNode[];
  edges: DiffEdge[];
}

/**
 * Normalizes an array of EvidenceRecords or a single EvidenceRecord to an array.
 * This simplifies deep equality comparisons.
 */
function normalizeEvidence(evidence: EvidenceRecord | EvidenceRecord[]): EvidenceRecord[] {
  if (Array.isArray(evidence)) {
    return evidence;
  }
  if (evidence) {
    return [evidence];
  }
  return [];
}

/**
 * Deep compares two arrays of EvidenceRecords.
 * Since evidence can shift in line numbers safely (e.g. adding imports at top of file),
 * we only mark MODIFIED if the snippet or file actually changes?
 * Wait, in Chomp, line numbers shifting is technically a modification, but
 * the user might want to know if the actual structure changed.
 * For now, strict deep equality is safest to detect any AST location change.
 */
function getEvidenceStatus(a: EvidenceRecord[], b: EvidenceRecord[]): 'UNCHANGED' | 'MODIFIED' | 'LEXICAL_SHIFT' {
  if (a.length !== b.length) return 'MODIFIED';
  
  const sortedA = [...a].sort((x, y) => (x.filePath + x.lineNumber).localeCompare(y.filePath + y.lineNumber));
  const sortedB = [...b].sort((x, y) => (x.filePath + x.lineNumber).localeCompare(y.filePath + y.lineNumber));

  let hasLexicalShift = false;
  for (let i = 0; i < sortedA.length; i++) {
    const ea = sortedA[i];
    const eb = sortedB[i];
    
    // If the actual file or structural snippet changed, it's structurally modified
    if (ea.filePath !== eb.filePath || ea.snippet !== eb.snippet || ea.evidenceRole !== eb.evidenceRole) {
      return 'MODIFIED';
    }
    
    // If only the line number drifted, it's a lexical shift
    if (ea.lineNumber !== eb.lineNumber) {
      hasLexicalShift = true;
    }
  }
  return hasLexicalShift ? 'LEXICAL_SHIFT' : 'UNCHANGED';
}

/**
 * Deep compares metadata
 */
function isMetadataEqual(a?: Record<string, any>, b?: Record<string, any>): boolean {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

/**
 * Determines if an entity (Node or Edge) has been modified between the base and current graph.
 */
function getModificationStatus(baseObj: any, currentObj: any): 'UNCHANGED' | 'MODIFIED' | 'LEXICAL_SHIFT' {
  if (baseObj.parentBoundaryId !== currentObj.parentBoundaryId) return 'MODIFIED';
  if (baseObj.sourceId !== currentObj.sourceId) return 'MODIFIED';
  if (baseObj.targetId !== currentObj.targetId) return 'MODIFIED';
  
  if (!isMetadataEqual(baseObj.metadata, currentObj.metadata)) return 'MODIFIED';
  
  const evidenceStatus = getEvidenceStatus(normalizeEvidence(baseObj.evidence), normalizeEvidence(currentObj.evidence));
  return evidenceStatus;
}

function deduplicateNodes(nodes: StructuralNode[]): StructuralNode[] {
  const map = new Map<string, StructuralNode>();
  for (const n of nodes) {
    if (map.has(n.id)) {
      const existing = map.get(n.id)!;
      existing.evidence = [...normalizeEvidence(existing.evidence), ...normalizeEvidence(n.evidence)];
    } else {
      map.set(n.id, { ...n, evidence: [...normalizeEvidence(n.evidence)] });
    }
  }
  return Array.from(map.values());
}

function deduplicateEdges(edges: StructuralEdge[]): StructuralEdge[] {
  const map = new Map<string, StructuralEdge>();
  for (const e of edges) {
    if (map.has(e.id)) {
      const existing = map.get(e.id)!;
      existing.evidence = [...normalizeEvidence(existing.evidence), ...normalizeEvidence(e.evidence)];
    } else {
      map.set(e.id, { ...e, evidence: [...normalizeEvidence(e.evidence)] });
    }
  }
  return Array.from(map.values());
}

/**
 * Compares two Chomp graphs and computes the structural drift.
 * 
 * @param base - The previously committed representation graph
 * @param current - The fresh representation graph from the working directory
 * @returns An IntentDiff containing all nodes and edges marked with ADDED, REMOVED, MODIFIED, or UNCHANGED.
 */
export function compareGraphs(base: RepresentationGraph, current: RepresentationGraph): IntentDiff {
  const diff: IntentDiff = {
    nodes: [],
    edges: []
  };

  const baseNodes = deduplicateNodes(base.nodes);
  const currentNodes = deduplicateNodes(current.nodes);

  const baseNodeMap = new Map(baseNodes.map(n => [n.id, n]));
  const currentNodeMap = new Map(currentNodes.map(n => [n.id, n]));

  // 1. Process current nodes (find ADDED, MODIFIED, UNCHANGED)
  for (const currentNode of currentNodes) {
    const baseNode = baseNodeMap.get(currentNode.id);
    if (!baseNode) {
      diff.nodes.push({ ...currentNode, diffStatus: 'ADDED' });
    } else {
      const status = getModificationStatus(baseNode, currentNode);
      diff.nodes.push({ ...currentNode, diffStatus: status });
    }
  }

  // 2. Process base nodes (find REMOVED)
  for (const baseNode of baseNodes) {
    if (!currentNodeMap.has(baseNode.id)) {
      diff.nodes.push({ ...baseNode, diffStatus: 'REMOVED' });
    }
  }

  const baseEdges = deduplicateEdges(base.edges);
  const currentEdges = deduplicateEdges(current.edges);

  const baseEdgeMap = new Map(baseEdges.map(e => [e.id, e]));
  const currentEdgeMap = new Map(currentEdges.map(e => [e.id, e]));

  // 3. Process current edges
  for (const currentEdge of currentEdges) {
    const baseEdge = baseEdgeMap.get(currentEdge.id);
    if (!baseEdge) {
      diff.edges.push({ ...currentEdge, diffStatus: 'ADDED' });
    } else {
      const status = getModificationStatus(baseEdge, currentEdge);
      diff.edges.push({ ...currentEdge, diffStatus: status });
    }
  }

  // 4. Process base edges (find REMOVED)
  for (const baseEdge of baseEdges) {
    if (!currentEdgeMap.has(baseEdge.id)) {
      diff.edges.push({ ...baseEdge, diffStatus: 'REMOVED' });
    }
  }

  return diff;
}
