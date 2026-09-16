import { RepresentationGraph, StructuralNode, StructuralEdge } from '../types/ontology.js';

export interface CondensedGraph {
  nodes: StructuralNode[];
  edges: StructuralEdge[];
}

/**
 * Entity types that represent macroscopic package-level boundaries considered
 * candidates for the L1 condensed graph.
 * EXTERNAL_PACKAGE nodes are candidates but subject to fan-in filtering below.
 * NODE_BUILTIN is never included — OS/filesystem interfaces carry no data-flow meaning.
 */
const MACRO_ENTITY_TYPES = new Set(['WORKSPACE_PACKAGE', 'EXTERNAL_PACKAGE']);

/**
 * Filesystem and OS-level utility packages that have no data-flow meaning
 * in a transit map — they are implementation details of any package that uses them.
 * Excluded at all view levels regardless of fan-in count.
 */
const FILESYSTEM_UTILITY_PACKAGES = new Set([
  'fs', 'node:fs',
  'path', 'node:path',
  'crypto', 'node:crypto',
  'os', 'node:os',
  'url', 'node:url',
  'util', 'node:util',
  'child_process', 'node:child_process',
  'stream', 'node:stream',
  'events', 'node:events',
  'ignore',   // gitignore pattern matching — filesystem concern, not data flow
]);


/**
 * Compresses the raw AST-level representation graph into a macroscopic "Transit Map"
 * topology suitable for LLM layout generation and high-level visualization.
 *
 * Strategy:
 *   Pass 1 — collect only WORKSPACE_PACKAGE and EXTERNAL_PACKAGE nodes as macro nodes.
 *   Pass 2 — for every other node, resolve it to its nearest macro ancestor by
 *             walking the parentBoundaryId chain. Build a rollup map.
 *   Pass 3 — rewire all edges so both endpoints are macro nodes, then deduplicate.
 *
 * This guarantees the AI cartographer always receives a clean N-package graph,
 * never raw file boundaries or fine-grained contract nodes.
 */
export function condenseGraph(graph: RepresentationGraph): CondensedGraph {
  // Pass 1a: index all nodes and collect workspace + candidate external packages
  const nodeById = new Map<string, StructuralNode>();
  const workspaceNodes = new Map<string, StructuralNode>(); // WORKSPACE_PACKAGE only
  const externalCandidates = new Map<string, StructuralNode>(); // EXTERNAL_PACKAGE candidates

  for (const node of graph.nodes) {
    nodeById.set(node.id, node);

    if (node.entityType === 'WORKSPACE_PACKAGE') {
      workspaceNodes.set(node.id, node);
    } else if (node.entityType === 'EXTERNAL_PACKAGE') {
      // Strip the "Package: " prefix to get the bare package name for utility check
      const pkgName = node.name.replace(/^Package:\s*/, '');
      if (!FILESYSTEM_UTILITY_PACKAGES.has(pkgName)) {
        externalCandidates.set(node.id, node);
      }
    }
    // NODE_BUILTIN: never included
  }

  // Pass 1b: fan-in filter — an external package only survives at L1 if ≥2 distinct
  // workspace packages depend on it (directly or via a file/contract rollup chain).
  // We do a lightweight pre-scan: for each edge, resolve source to its workspace package
  // ancestor and check if the target is an external candidate.
  const workspaceAncestorCache = new Map<string, string | null>();

  function resolveToWorkspace(nodeId: string): string | null {
    if (workspaceAncestorCache.has(nodeId)) return workspaceAncestorCache.get(nodeId)!;
    if (workspaceNodes.has(nodeId)) return nodeId;
    const visited = new Set<string>();
    let cur: string | undefined = nodeId;
    while (cur) {
      if (workspaceNodes.has(cur)) { workspaceAncestorCache.set(nodeId, cur); return cur; }
      if (visited.has(cur)) break;
      visited.add(cur);
      cur = nodeById.get(cur)?.parentBoundaryId ?? undefined;
    }
    workspaceAncestorCache.set(nodeId, null);
    return null;
  }

  // Count distinct workspace packages that have at least one edge pointing to each external candidate
  const externalFanIn = new Map<string, Set<string>>(); // externalId → Set<workspacePkgId>
  for (const edge of graph.edges) {
    if (!edge.targetId) continue;
    const targetNode = nodeById.get(edge.targetId);
    if (!targetNode || !externalCandidates.has(edge.targetId)) continue;

    const srcWorkspace = resolveToWorkspace(edge.sourceId);
    if (!srcWorkspace) continue;

    if (!externalFanIn.has(edge.targetId)) externalFanIn.set(edge.targetId, new Set());
    externalFanIn.get(edge.targetId)!.add(srcWorkspace);
  }

  // Build final macro node set: all workspace packages + external packages with fan-in ≥ 2
  const macroNodes = new Map<string, StructuralNode>(workspaceNodes);
  for (const [extId, dependents] of externalFanIn) {
    if (dependents.size >= 2) {
      macroNodes.set(extId, externalCandidates.get(extId)!);
    }
  }

  // Pass 2: resolve every non-macro node to its nearest macro ancestor
  const rollupCache = new Map<string, string | null>();

  function resolveToMacro(nodeId: string): string | null {
    if (rollupCache.has(nodeId)) return rollupCache.get(nodeId)!;
    if (macroNodes.has(nodeId)) return nodeId;
    const visited = new Set<string>();
    let cur: string | undefined = nodeId;
    while (cur) {
      if (macroNodes.has(cur)) { rollupCache.set(nodeId, cur); return cur; }
      if (visited.has(cur)) break;
      visited.add(cur);
      cur = nodeById.get(cur)?.parentBoundaryId ?? undefined;
    }
    rollupCache.set(nodeId, null);
    return null;
  }

  // Pass 3: rewire edges between macro nodes and deduplicate
  const condensedEdges = new Map<string, StructuralEdge>();

  for (const edge of graph.edges) {
    if (!edge.targetId) continue;

    const srcId = resolveToMacro(edge.sourceId);
    const tgtId = resolveToMacro(edge.targetId);

    if (!srcId || !tgtId) continue;
    if (srcId === tgtId) continue;

    const edgeKey = `${srcId}::${tgtId}`;
    if (!condensedEdges.has(edgeKey)) {
      condensedEdges.set(edgeKey, {
        id: `edge_${srcId}_${tgtId}`,
        sourceId: srcId,
        targetId: tgtId,
        type: 'RELATIONSHIP',
        name: `${srcId} -> ${tgtId}`,
        entityType: 'MACRO_EDGE',
        patternId: 'cartographer.macro',
        evidence: { filePath: 'synthetic' },
      });
    }
  }

  return {
    nodes: Array.from(macroNodes.values()),
    edges: Array.from(condensedEdges.values()),
  };
}

