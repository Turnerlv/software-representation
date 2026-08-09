import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

export function visitBoundary(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isClassDeclaration(node) && node.name) {
    return {
      id: nextId(),
      name: `Class: ${node.name.text}`,
      type: 'BOUNDARY',
      evidence: getEvidence(node),
    };
  }
  if (ts.isModuleDeclaration(node)) {
    return {
      id: nextId(),
      name: `Module: ${node.name.text}`,
      type: 'BOUNDARY',
      evidence: getEvidence(node),
    };
  }
  return null;
}
