// packages/core/src/extractor/visitors/definePropertyVisitor.ts
// Visitor for extracting Object.defineProperty getter contracts.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/**
 * Extracts Object.defineProperty calls that define properties (usually getters/setters)
 * on objects, treating them as CONTRACT entities.
 * 
 * Matches expressions like:
 * - `Object.defineProperty(obj, 'name', { get: ... })` (CONTRACT)
 *
 * @param node         The AST node to inspect.
 * @param getEvidence  Returns a populated EvidenceRecord for the given node.
 * @param nextId       Closure providing a placeholder ID.
 * @returns A StructuralEntity or null if the node does not match.
 */
export function extractDefinePropertyContract(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node)) {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr.expression) && expr.expression.text === 'Object' && expr.name.text === 'defineProperty') {
        if (node.arguments.length >= 2) {
          const propNameArg = node.arguments[1];
          if (ts.isStringLiteral(propNameArg) || ts.isIdentifier(propNameArg)) {
            const propName = propNameArg.text;
            return {
              id: nextId(),
              name: `Property Getter: ${propName}`,
              type: 'CONTRACT',
              entityType: 'PROPERTY_GETTER', patternId: 'contract.define-property',
              evidence: getEvidence(node),
            };
          }
        }
      }
    } else if (ts.isIdentifier(node.expression) && node.expression.text === 'defineGetter') {
      if (node.arguments.length >= 2) {
        const propNameArg = node.arguments[1];
        if (ts.isStringLiteral(propNameArg) || ts.isIdentifier(propNameArg)) {
          const propName = propNameArg.text;
          return {
            id: nextId(),
            name: `Property Getter: ${propName}`,
            type: 'CONTRACT',
            entityType: 'PROPERTY_GETTER', patternId: 'contract.define-property',
            evidence: getEvidence(node),
          };
        }
      }
    }
  }

  return null;
}
