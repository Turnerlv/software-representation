// packages/core/src/extractor/visitors/eventEmitterVisitor.ts
// Visitor functions for Node.js EventEmitter subscriber contracts and publisher relationships.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/**
 * Extracts an EventEmitter subscriber call (`.on('event', fn)`, `.addListener(...)`, `.once(...)`)
 * as a CONTRACT primitive entity.
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns A CONTRACT StructuralEntity for the listener, or null if node does not match.
 */
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
            entityType: 'EVENT_LISTENER',
            evidence: getEvidence(node),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Extracts an EventEmitter publisher call (`.emit('event', ...payload)`)
 * as an OPEN_CONNECTOR primitive entity (since we don't know who is listening).
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns An OPEN_CONNECTOR StructuralEntity for the event dispatch, or null if node does not match.
 */
export function extractEventEmitterEmit(
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
            type: 'OPEN_CONNECTOR',
            entityType: 'EVENT_EMIT',
            evidence: getEvidence(node),
          };
        }
      }
    }
  }

  return null;
}
