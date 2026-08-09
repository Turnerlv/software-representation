import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

export function visitOpenConnector(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node)) {
    const expressionText = node.expression.getText(sourceFile);

    const isFetchOrNetwork =
      expressionText === 'fetch' ||
      expressionText.startsWith('axios') ||
      expressionText.includes('http') ||
      expressionText.includes('db.') ||
      expressionText.includes('query');

    if (isFetchOrNetwork) {
      return {
        id: nextId(),
        name: `External Call: ${expressionText}`,
        type: 'OPEN_CONNECTOR',
        evidence: getEvidence(node),
      };
    }
  }
  return null;
}
