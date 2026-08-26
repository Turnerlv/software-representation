// packages/core/src/extractor/visitors/directiveVisitor.ts
// Visitor for file-level directive prologues and server-boundary guards.
//
// Structural patterns handled:
//   - 'use server' directive  → CONTRACT (NEXTJS_DIRECTIVE) — marks all exports as Server Actions
//   - 'use client' directive  → CONTRACT (NEXTJS_DIRECTIVE) — marks file as a Client Component
//   - import 'server-only'    → CONTRACT (SERVER_GUARD) — prevents client-bundle inclusion

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/** Directive string values that have structural significance in Next.js. */
const NEXTJS_DIRECTIVES = new Set(['use server', 'use client']);

/**
 * Extracts a Next.js file-level directive as a CONTRACT entity.
 *
 * Matches top-level `ExpressionStatement` nodes whose sole expression is a
 * `StringLiteral` with value `'use server'` or `'use client'`. These "directive
 * prologue" nodes appear as the first statement in a source file and mark the
 * module's rendering boundary.
 *
 * @param node        The AST node to inspect.
 * @param sourceFile  The TypeScript SourceFile, used to check if node is a direct child.
 * @param getEvidence Returns an EvidenceRecord for the given node.
 * @param nextId      Placeholder ID closure — replaced by stableEntityId() in orchestrator.
 * @returns A CONTRACT StructuralEntity, or null.
 */
export function extractDirectiveContract(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  // Must be a top-level ExpressionStatement (direct child of SourceFile)
  if (!ts.isExpressionStatement(node)) return null;
  if (node.parent !== sourceFile) return null;

  const expr = node.expression;
  if (!ts.isStringLiteral(expr)) return null;

  const value = expr.text;
  if (!NEXTJS_DIRECTIVES.has(value)) return null;

  const label = value === 'use server' ? 'Server Actions Module' : 'Client Component Module';
  return {
    id: nextId(),
    name: `Directive: '${value}'`,
    type: 'CONTRACT',
    entityType: 'NEXTJS_DIRECTIVE',
    patternId: value === 'use server'
      ? 'contract.nextjs-use-server-directive'
      : 'contract.nextjs-use-server-directive',
    evidence: getEvidence(node),
    metadata: { directive: value, label },
  };
}

/**
 * Extracts an `import 'server-only'` side-effect import as a SERVER_GUARD CONTRACT.
 *
 * The `server-only` package throws a build-time error if a module is accidentally
 * bundled for the client. This import is a structural assertion — a trust boundary
 * between server and client code — and should be represented as a CONTRACT on the
 * file's boundary.
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Returns an EvidenceRecord for the given node.
 * @param nextId      Placeholder ID closure.
 * @returns A CONTRACT StructuralEntity, or null.
 */
export function extractServerOnlyGuard(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (!ts.isImportDeclaration(node)) return null;
  if (!ts.isStringLiteral(node.moduleSpecifier)) return null;
  if (node.moduleSpecifier.text !== 'server-only') return null;
  // Must be a bare side-effect import (no import clause)
  if (node.importClause) return null;

  return {
    id: nextId(),
    name: `Server Guard: server-only`,
    type: 'CONTRACT',
    entityType: 'SERVER_GUARD',
    patternId: 'contract.nextjs-server-only-guard',
    evidence: getEvidence(node),
  };
}
