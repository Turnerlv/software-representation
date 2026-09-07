import { RepresentationGraph, StructuralNode, StructuralEdge } from '../types/ontology.js';

export interface CondensedGraph {
  nodes: StructuralNode[];
  edges: StructuralEdge[];
}

/**
 * Compresses the raw AST-level representation graph into a macroscopic "Transit Map"
 * topology suitable for LLM layout generation and high-level visualization.
 * 
 * - Prunes AST noise (types, directives, node built-ins)
 * - Rolls up contracts (functions, classes) into their parent boundaries (files/modules)
 * - Deduplicates rewired edges
 */
export function condenseGraph(graph: RepresentationGraph): CondensedGraph {
  const PRUNED_TYPES = new Set([
    'EXPORTED_TYPE', 
    'INTERFACE', 
    'NEXTJS_METADATA', 
    'NEXTJS_DIRECTIVE', 
    'NODE_BUILTIN', 
    'PROPERTY_GETTER',
    'TYPE'
  ]);

  const boundaryMap = new Map<string, StructuralNode>();
  const contractToBoundaryMap = new Map<string, string>();
  const keptNodes = new Map<string, StructuralNode>();

  // 1. Identify boundaries and inherently macroscopic nodes
  for (const node of graph.nodes) {
    if (PRUNED_TYPES.has(node.entityType)) continue;

    if (node.type === 'BOUNDARY' || node.entityType === 'EXTERNAL_PACKAGE' || node.entityType === 'WORKSPACE_PACKAGE') {
      boundaryMap.set(node.id, node);
      keptNodes.set(node.id, node);
    }
  }

  // 2. Map fine-grained contracts to their macroscopic boundaries
  for (const node of graph.nodes) {
    if (PRUNED_TYPES.has(node.entityType)) continue;

    if (node.type === 'CONTRACT') {
      if (node.parentBoundaryId && boundaryMap.has(node.parentBoundaryId)) {
        // Queue for rollup
        contractToBoundaryMap.set(node.id, node.parentBoundaryId);
      
        // Orphaned contract or one without a clear boundary. Keep it.
        keptNodes.set(node.id, node);
      }
    } else if (node.type === 'OPEN_CONNECTOR') {
      keptNodes.set(node.id, node);
    }
  }

  // 3. Rewire and deduplicate edges based on rollups
  const newEdges = new Map<string, StructuralEdge>();

  for (const edge of graph.edges) {
    // Resolve to parent boundary if the node was rolled up
    const sourceId = contractToBoundaryMap.get(edge.sourceId) || edge.sourceId;
    const targetId = edge.targetId ? (contractToBoundaryMap.get(edge.targetId) || edge.targetId) : undefined;
    
    if (!sourceId || !targetId) continue;
    

    // Drop edges pointing to/from completely pruned nodes
    if (!keptNodes.has(sourceId) || !keptNodes.has(targetId)) {
      continue;
    }

    // Drop self-referential edges after rollup (e.g., File A calling File A)
    if (sourceId === targetId) {
      continue;
    }

    const edgeKey = `${sourceId}::${targetId}`;
    if (!newEdges.has(edgeKey)) {
      newEdges.set(edgeKey, {
        id: `edge_${sourceId}_${targetId}`,
        sourceId,
        targetId,
        type: 'RELATIONSHIP',
        name: `${sourceId} -> ${targetId}`,
        entityType: 'MACRO_EDGE',
        patternId: 'cartographer.macro',
        evidence: { filePath: 'synthetic' }
        
      });
    
      
    }
  }

  return {
    nodes: Array.from(keptNodes.values()),
    edges: Array.from(newEdges.values())
  };
}
