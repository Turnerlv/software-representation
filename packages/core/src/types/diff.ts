import { StructuralNode, StructuralEdge } from './ontology.js';

export type DiffStatus = 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED' | 'LEXICAL_SHIFT';

export interface DiffNode {
  status: DiffStatus;
  base?: StructuralNode;
  target?: StructuralNode;
}

export interface DiffEdge {
  status: DiffStatus;
  base?: StructuralEdge;
  target?: StructuralEdge;
}

export interface GraphDelta {
  baseCommitSha?: string;
  targetCommitSha?: string;
  nodes: Record<string, DiffNode>;
  edges: Record<string, DiffEdge>;
}
