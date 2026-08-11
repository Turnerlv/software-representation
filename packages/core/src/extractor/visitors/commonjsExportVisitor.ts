// packages/core/src/extractor/visitors/commonjsExportVisitor.ts
// Visitor for extracting CommonJS module exports and aliased exports.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/**
 * Extracts CommonJS module exports and aliased exports.
 * 
 * Matches expressions like:
 * - `module.exports = ...` (BOUNDARY)
 * - `exports.name = ...` (BOUNDARY)
 * - `app.init = function() { ... }` (CONTRACT) where app is an alias
 * - `app[method] = function (path) { ... }` (CONTRACT) dynamic assignment
 *
 * @param node         The AST node to inspect.
 * @param getEvidence  Returns a populated EvidenceRecord for the given node.
 * @param nextId       Closure providing a placeholder ID.
 * @returns A StructuralEntity or null if the node does not match.
 */
export function extractCommonjsExport(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    let isCjsExport = false;
    let exportName = 'default';
    
    const left = node.left;
    if (ts.isPropertyAccessExpression(left)) {
      if (ts.isIdentifier(left.expression) && left.expression.text === 'module' && left.name.text === 'exports') {
        isCjsExport = true;
      } else if (ts.isPropertyAccessExpression(left.expression) && ts.isIdentifier(left.expression.expression) && left.expression.expression.text === 'module' && left.expression.name.text === 'exports') {
        isCjsExport = true;
        exportName = left.name.text;
      } else if (ts.isIdentifier(left.expression) && left.expression.text === 'exports') {
        isCjsExport = true;
        exportName = left.name.text;
      } else if (ts.isIdentifier(left.expression) && ['app', 'req', 'res'].includes(left.expression.text)) {
        // Express alias
        isCjsExport = true;
        exportName = left.name.text;
      }
    } else if (ts.isIdentifier(left) && left.text === 'exports') {
      isCjsExport = true;
    } else if (ts.isElementAccessExpression(left)) {
      // Dynamic export (e.g. app[method] = function() {})
      const leftExpr = left.expression;
      if (ts.isIdentifier(leftExpr) && ['app', 'req', 'res'].includes(leftExpr.text)) {
        const isFunction = ts.isFunctionExpression(node.right) || ts.isArrowFunction(node.right);
        if (isFunction) {
          return {
            id: nextId(),
            name: `Dynamic Export: ${leftExpr.text}[method]`,
            type: 'CONTRACT',
            evidence: getEvidence(node),
          };
        }
      }
    }
    
    if (isCjsExport) {
      // If it's assigning a function, treat as a CONTRACT, otherwise BOUNDARY.
      const isFunction = ts.isFunctionExpression(node.right) || ts.isArrowFunction(node.right);
      return {
        id: nextId(),
        name: `CJS Export: ${exportName}`,
        type: isFunction ? 'CONTRACT' : 'BOUNDARY',
        evidence: getEvidence(node),
      };
    }
  }

  return null;
}
