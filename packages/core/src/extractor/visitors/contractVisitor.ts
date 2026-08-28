// packages/core/src/extractor/visitors/contractVisitor.ts
// Visitor for CONTRACT primitives — explicit interfaces for inter-unit communication.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';
import { extractExpressRoute, extractExpressRouteParameter, extractExpressContentNegotiation, extractExpressDynamicMethods } from '../adapters/expressAdapter.js';
import { extractEventEmitterContract, extractSocketOnAnyContract } from './eventEmitterVisitor.js';
import { extractCommonjsExport } from './commonjsExportVisitor.js';
import { extractDefinePropertyContract } from './definePropertyVisitor.js';
import { NextjsFileRole, extractNextjsRouteHandlerContracts, extractNextjsMiddlewareExport } from '../adapters/nextjsAdapter.js';
import { extractDirectiveContract, extractServerOnlyGuard } from './directiveVisitor.js';
import { extractFactoryExport } from './factoryExportVisitor.js';

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
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string,
  fileRole?: NextjsFileRole | null
): StructuralEntity | StructuralEntity[] | null {
  if (ts.isInterfaceDeclaration(node) && node.name) {
    return {
      id: nextId(),
      name: `Interface: ${node.name.text}`,
      type: 'CONTRACT',
      entityType: 'EXPORTED_TYPE', patternId: 'contract.interface-declaration',
      evidence: getEvidence(node),
    };
  }
  if (ts.isTypeAliasDeclaration(node) && node.name) {
    return {
      id: nextId(),
      name: `Type: ${node.name.text}`,
      type: 'CONTRACT',
      entityType: 'EXPORTED_TYPE', patternId: 'contract.type-alias-declaration',
      evidence: getEvidence(node),
    };
  }
  if (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    // Skip functions whose names are HTTP method names in a ROUTE_HANDLER file —
    // those are handled more specifically by extractNextjsRouteHandlerContracts.
    const isRouteMethod = fileRole === 'ROUTE_HANDLER' &&
      new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).has(node.name.text);
    // Skip default-exported functions in PAGE files — captured as BOUNDARY by extractNextjsPageBoundary.
    const isPageDefault = fileRole === 'PAGE' &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (!isRouteMethod && !isPageDefault) {
      return {
        id: nextId(),
        name: `Exported Function: ${node.name.text}`,
        type: 'CONTRACT',
        entityType: 'EXPORTED_FUNCTION', patternId: 'contract.exported-function',
        evidence: getEvidence(node),
      };
    }
  }

  // Next.js: directive prologues ('use server', 'use client')
  const directive = extractDirectiveContract(node, sourceFile, getEvidence, nextId);
  if (directive) return directive;

  // Next.js: server-only import guard
  const serverGuard = extractServerOnlyGuard(node, getEvidence, nextId);
  if (serverGuard) return serverGuard;

  // Next.js: Route Handler contracts (GET/POST/... exports in route.ts)
  const routeHandlers = extractNextjsRouteHandlerContracts(node, fileRole ?? null, getEvidence, nextId);
  if (routeHandlers) return routeHandlers;

  // Next.js: middleware export contract
  const middleware = extractNextjsMiddlewareExport(node, fileRole ?? null, getEvidence, nextId);
  if (middleware) return middleware;

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

  const factoryExport = extractFactoryExport(node, getEvidence, nextId);
  if (factoryExport) return factoryExport;

  return null;
}
