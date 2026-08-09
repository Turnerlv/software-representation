import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

export function visitRelationship(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isImportDeclaration(node)) {
    const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
    return {
      id: nextId(),
      name: `Import: ${moduleSpecifier}`,
      type: 'RELATIONSHIP',
      evidence: getEvidence(node),
    };
  }
  return null;
}
