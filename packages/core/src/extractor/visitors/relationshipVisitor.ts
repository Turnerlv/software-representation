// packages/core/src/extractor/visitors/relationshipVisitor.ts
// Visitor for RELATIONSHIP primitives — known structural dependencies between units.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';
import { extractExpressRouterMount } from '../adapters/expressAdapter.js';

/**
 * Inspects a single AST node and returns a RELATIONSHIP entity if it matches a known dependency pattern.
 *
 * Currently handled patterns:
 * - ImportDeclaration  (static ESM imports — named, default, namespace, and side-effect)
 *
 * Known gaps (not yet handled — log via parser-eval-harness):
 * - require('module')         CommonJS require calls
 * - import('module')          Dynamic ESM imports
 * - extends BaseClass         Class inheritance
 * - implements Interface      Contract implementation
 * - app.use('/prefix', router) Express router mounting
 *
 * @param node        The AST node to inspect.
 * @param sourceFile  Required to extract the module specifier text.
 * @param getEvidence Returns a populated EvidenceRecord for the given node.
 * @param nextId      Placeholder closure — replaced by stableEntityId() in the orchestrator.
 * @returns A StructuralEntity or null if the node does not match any RELATIONSHIP pattern.
 */
export function visitRelationship(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return {
      id: nextId(),
      name: `Import: ${node.moduleSpecifier.text}`,
      type: 'RELATIONSHIP',
      evidence: getEvidence(node),
    };
  }

  // CommonJS Require
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0) {
    const firstArg = node.arguments[0];
    if (ts.isStringLiteral(firstArg)) {
      return {
        id: nextId(),
        name: `Require: ${firstArg.text}`,
        type: 'RELATIONSHIP',
        evidence: getEvidence(node),
      };
    }
  }

  const expressMount = extractExpressRouterMount(node, sourceFile, getEvidence, nextId);
  if (expressMount) return expressMount;

  return null;
}
