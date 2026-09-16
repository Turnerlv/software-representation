import { RepresentationGraph, StructuralNode, StructuralEdge, EvidenceRecord } from "../types/ontology.js";
import { GraphDelta, DiffStatus, DiffNode, DiffEdge } from "../types/diff.js";

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
 * @returns A GraphDelta mapping nodes and edges to their diff status and preserving base/target integrity.
 */
export function compareGraphs(base: RepresentationGraph, current: RepresentationGraph): GraphDelta {
  const diff: GraphDelta = {
    baseCommitSha: base.commitSha,
    targetCommitSha: current.commitSha,
    nodes: {},
    edges: {}
  };

  const baseNodes = deduplicateNodes(base.nodes);
  const currentNodes = deduplicateNodes(current.nodes);

  const baseNodeMap = new Map(baseNodes.map(n => [n.id, n]));
  const currentNodeMap = new Map(currentNodes.map(n => [n.id, n]));

  // 1. Process current nodes (find ADDED, MODIFIED, UNCHANGED)
  for (const currentNode of currentNodes) {
    const baseNode = baseNodeMap.get(currentNode.id);
    if (!baseNode) {
      diff.nodes[currentNode.id] = { status: 'ADDED', target: currentNode };
    } else {
      const status = getModificationStatus(baseNode, currentNode);
      diff.nodes[currentNode.id] = { status, base: baseNode, target: currentNode };
    }
  }

  // 2. Process base nodes (find REMOVED)
  for (const baseNode of baseNodes) {
    if (!currentNodeMap.has(baseNode.id)) {
      diff.nodes[baseNode.id] = { status: 'REMOVED', base: baseNode };
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
      diff.edges[currentEdge.id] = { status: 'ADDED', target: currentEdge };
    } else {
      const status = getModificationStatus(baseEdge, currentEdge);
      diff.edges[currentEdge.id] = { status, base: baseEdge, target: currentEdge };
    }
  }

  // 4. Process base edges (find REMOVED)
  for (const baseEdge of baseEdges) {
    if (!currentEdgeMap.has(baseEdge.id)) {
      diff.edges[baseEdge.id] = { status: 'REMOVED', base: baseEdge };
    }
  }

  return diff;
}
