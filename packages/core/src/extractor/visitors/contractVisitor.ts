// packages/core/src/extractor/visitors/contractVisitor.ts
// Visitor for CONTRACT primitives — explicit interfaces for inter-unit communication.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/**
 * Inspects a single AST node and returns a CONTRACT entity if it matches a known interface pattern.
 *
 * Currently handled patterns:
 * - InterfaceDeclaration   (any named interface)
 * - TypeAliasDeclaration   (any named type alias)
 * - FunctionDeclaration    (named + exported only — unexported helpers are not contracts)
 *
 * @param node      The AST node to inspect.
 * @param getEvidence  Returns a populated EvidenceRecord for the given node.
 * @param nextId    Placeholder closure — replaced by stableEntityId() in the orchestrator.
 * @returns A StructuralEntity or null if the node does not match any CONTRACT pattern.
 */
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
