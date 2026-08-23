// packages/core/src/extractor/visitors/boundaryVisitor.ts
// Visitor for BOUNDARY primitives — structural scopes that define where a unit begins and ends.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';
import { extractCommonjsExport } from './commonjsExportVisitor.js';
import { resolveModulePath } from '../pathResolver.js';
import { extractExpressMiddlewareBoundary } from '../adapters/expressAdapter.js';

/**
 * Inspects a single AST node and returns a BOUNDARY entity if it matches a known scope pattern.
 *
 * Currently handled patterns:
 * - ClassDeclaration   (named classes only)
 * - ModuleDeclaration  (namespace/module blocks)
 * - BinaryExpression   (CommonJS module exports: `module.exports = ...`, `exports.name = ...`)
 * - ImportDeclaration  (External packages)
 * - Require Calls      (External packages)
 * - Express Middleware (Express routes/middleware)
 *
 * @param node         The AST node to inspect.
 * @param sourceFile   TypeScript SourceFile object used for text extraction.
 * @param getEvidence  Returns a populated EvidenceRecord for the given node.
 * @param nextId       Closure providing a placeholder ID — replaced by stableEntityId() in the orchestrator.
 * @param repoRoot     The repository root for path resolution.
 * @returns A StructuralEntity, array of entities, or null if the node does not match any BOUNDARY pattern.
 */
export function visitBoundary(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string,
  repoRoot: string = ''
): StructuralEntity | StructuralEntity[] | null {
  if (ts.isClassDeclaration(node) && node.name) {
    return {
      id: nextId(),
      name: `Class: ${node.name.text}`,
      type: 'BOUNDARY',
      entityType: 'CLASS', patternId: 'boundary.class-declaration',
      evidence: getEvidence(node),
    };
  }
  if (ts.isModuleDeclaration(node)) {
    return {
      id: nextId(),
      name: `Module: ${node.name.text}`,
      type: 'BOUNDARY',
      entityType: 'MODULE', patternId: 'boundary.module-declaration',
      evidence: getEvidence(node),
    };
  }
  if (ts.isExportAssignment(node)) {
    return {
      id: nextId(),
      name: `Module Export (Default)`,
      type: 'BOUNDARY',
      entityType: 'MODULE', patternId: 'boundary.es6-export-default',
      evidence: getEvidence(node),
    };
  }
  const cjsExport = extractCommonjsExport(node, getEvidence, nextId);
  if (cjsExport && cjsExport.type === 'BOUNDARY') return cjsExport;

  // External package boundaries from imports
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    const importLiteral = node.moduleSpecifier.text;
    const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot);
    if (!resolvedPath && !importLiteral.startsWith('.')) {
      return {
        id: nextId(),
        name: `Package: ${importLiteral}`,
        type: 'BOUNDARY',
        entityType: importLiteral.startsWith('node:') ? 'NODE_BUILTIN' : 'EXTERNAL_PACKAGE', patternId: 'boundary.external-import',
        evidence: getEvidence(node),
      };
    }
  }

  // External package boundaries from requires
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0) {
    const firstArg = node.arguments[0];
    if (ts.isStringLiteral(firstArg)) {
      const importLiteral = firstArg.text;
      const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot);
      if (!resolvedPath && !importLiteral.startsWith('.')) {
        return {
          id: nextId(),
          name: `Package: ${importLiteral}`,
          type: 'BOUNDARY',
          entityType: importLiteral.startsWith('node:') ? 'NODE_BUILTIN' : 'EXTERNAL_PACKAGE', patternId: 'boundary.external-require',
          evidence: getEvidence(node),
        };
      }
    }
  }

  const expressMiddleware = extractExpressMiddlewareBoundary(node, sourceFile, getEvidence, nextId);
  if (expressMiddleware) return expressMiddleware;

  return null;
}
