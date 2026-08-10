import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

export function extractEventEmitterContract(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    
    if (methodName === 'on' || methodName === 'addListener' || methodName === 'once') {
      if (node.arguments.length >= 1) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg)) {
          return {
            id: nextId(),
            name: `Event Listener: ${firstArg.text}`,
            type: 'CONTRACT',
            evidence: getEvidence(node),
          };
        }
      }
    }
  }

  return null;
}

export function extractEventEmitterRelationship(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    
    if (methodName === 'emit') {
      if (node.arguments.length >= 1) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg)) {
          return {
            id: nextId(),
            name: `Event Emit: ${firstArg.text}`,
            type: 'RELATIONSHIP',
            evidence: getEvidence(node),
          };
        }
      }
    }
  }

  return null;
}
