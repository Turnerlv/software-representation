// packages/core/src/extractor/visitors/contractVisitor.ts
// Visitor for CONTRACT primitives — explicit interfaces for inter-unit communication.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';
import { extractExpressRoute, extractExpressRouteParameter, extractExpressContentNegotiation, extractExpressDynamicMethods } from '../adapters/expressAdapter.js';
import { extractEventEmitterContract, extractSocketOnAnyContract } from './eventEmitterVisitor.js';
import { extractCommonjsExport } from './commonjsExportVisitor.js';
import { extractDefinePropertyContract } from './definePropertyVisitor.js';

/**
 * Inspects a single AST node and returns a CONTRACT entity if it matches a known interface pattern.
 *
 * Currently handled patterns:
 * - InterfaceDeclaration       (any named interface)
 * - TypeAliasDeclaration       (any named type alias)
 * - FunctionDeclaration        (named + exported only — unexported helpers are not contracts)
 * - Express Route Definitions  (delegated to `extractExpressRoute`)
 * - Express Route Parameters   (delegated to `extractExpressRouteParameter`)
 * - Express Content Format     (delegated to `extractExpressContentNegotiation`)
 * - EventEmitter Listeners     (delegated to `extractEventEmitterContract`)
 * - Socket.IO Wildcard Listener (delegated to `extractSocketOnAnyContract` — `.onAny(callback)` pattern)
 * - Object.defineProperty      (delegated to `extractDefinePropertyContract`)
 *
 * @param node         The AST node to inspect.
 * @param getEvidence  Returns a populated EvidenceRecord for the given node.
 * @param nextId       Placeholder closure — replaced by stableEntityId() in the orchestrator.
 * @returns A StructuralEntity or null if the node does not match any CONTRACT pattern.
 */
export function visitContract(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | StructuralEntity[] | null {
  if (ts.isInterfaceDeclaration(node) && node.name) {
    return {
      id: nextId(),
      name: `Interface: ${node.name.text}`,
      type: 'CONTRACT',
      entityType: 'EXPORTED_TYPE',
      evidence: getEvidence(node),
    };
  }
  if (ts.isTypeAliasDeclaration(node) && node.name) {
    return {
      id: nextId(),
      name: `Type: ${node.name.text}`,
      type: 'CONTRACT',
      entityType: 'EXPORTED_TYPE',
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
      entityType: 'EXPORTED_FUNCTION',
      evidence: getEvidence(node),
    };
  }
  
  const expressRoute = extractExpressRoute(node, getEvidence, nextId);
  if (expressRoute) return expressRoute;

  const expressParam = extractExpressRouteParameter(node, getEvidence, nextId);
  if (expressParam) return expressParam;

  const expressContentNegotiation = extractExpressContentNegotiation(node, getEvidence, nextId);
  if (expressContentNegotiation) return expressContentNegotiation;

  const expressDynamicMethods = extractExpressDynamicMethods(node, getEvidence, nextId);
  if (expressDynamicMethods) return expressDynamicMethods;

  const eventEmitterContract = extractEventEmitterContract(node, getEvidence, nextId);
  if (eventEmitterContract) return eventEmitterContract;

  const socketOnAnyContract = extractSocketOnAnyContract(node, getEvidence, nextId);
  if (socketOnAnyContract) return socketOnAnyContract;

  const cjsExport = extractCommonjsExport(node, getEvidence, nextId);
  if (cjsExport && cjsExport.type === 'CONTRACT') return cjsExport;

  const definePropertyContract = extractDefinePropertyContract(node, getEvidence, nextId);
  if (definePropertyContract) return definePropertyContract;

  return null;
}
