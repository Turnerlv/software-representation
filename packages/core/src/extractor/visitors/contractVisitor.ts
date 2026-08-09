import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

export function visitContract(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isInterfaceDeclaration(node) && node.name) {
    return {
      id: nextId(),
      name: `Interface: ${node.name.text}`,
      type: 'CONTRACT',
      evidence: getEvidence(node),
    };
  }
  if (ts.isTypeAliasDeclaration(node) && node.name) {
    return {
      id: nextId(),
      name: `Type: ${node.name.text}`,
      type: 'CONTRACT',
      evidence: getEvidence(node),
    };
  }
  if (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    return {
      id: nextId(),
      name: `Exported Function: ${node.name.text}`,
      type: 'CONTRACT',
      evidence: getEvidence(node),
    };
  }
  return null;
}
