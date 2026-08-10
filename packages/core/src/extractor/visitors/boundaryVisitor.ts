// packages/core/src/extractor/visitors/boundaryVisitor.ts
// Visitor for BOUNDARY primitives — structural scopes that define where a unit begins and ends.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/**
 * Inspects a single AST node and returns a BOUNDARY entity if it matches a known scope pattern.
 *
 * Currently handled patterns:
 * - ClassDeclaration   (named classes only)
 * - ModuleDeclaration  (namespace/module blocks)
 * - BinaryExpression   (CommonJS module exports: `module.exports = ...`, `exports.name = ...`)
 *
 * @param node         The AST node to inspect.
 * @param getEvidence  Returns a populated EvidenceRecord for the given node.
 * @param nextId       Closure providing a placeholder ID — replaced by stableEntityId() in the orchestrator.
 * @returns A StructuralEntity or null if the node does not match any BOUNDARY pattern.
 */
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
      }
    } else if (ts.isIdentifier(left) && left.text === 'exports') {
      isCjsExport = true;
    }
    
    if (isCjsExport) {
      return {
        id: nextId(),
        name: `CJS Export: ${exportName}`,
        type: 'BOUNDARY',
        evidence: getEvidence(node),
      };
    }
  }

  return null;
}
