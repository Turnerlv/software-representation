// packages/core/src/extractor/visitors/boundaryVisitor.ts
// Visitor for BOUNDARY primitives — structural scopes that define where a unit begins and ends.
import ts from 'typescript';
import { extractCommonjsExport } from './commonjsExportVisitor.js';
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
export function visitBoundary(node, getEvidence, nextId) {
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
    const cjsExport = extractCommonjsExport(node, getEvidence, nextId);
    if (cjsExport && cjsExport.type === 'BOUNDARY')
        return cjsExport;
    return null;
}
