// packages/core/src/extractor/visitors/factoryExportVisitor.ts
// Visitor for contracts created by exporting the result of known factory functions.
//
// Structural patterns handled:
//   - NextAuth factory destructure -> CONTRACT (e.g. `export const { auth, signIn } = NextAuth(...)`)
//   - Drizzle-Zod validator export -> CONTRACT (e.g. `export const insertSchema = createInsertSchema(...)`)

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/** Set of known factory function names that return structural interfaces */
const FACTORY_FUNCTIONS = new Set([
  'NextAuth',
  'createInsertSchema',
  'createSelectSchema',
  'pgTable',
]);

/**
 * Extracts CONTRACT entities from variable statements that export the result
 * of known framework factory functions.
 *
 * Handles both direct assignment (`export const x = factory()`) and
 * object destructuring (`export const { a, b } = factory()`).
 */
export function extractFactoryExport(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | StructuralEntity[] | null {
  if (!ts.isVariableStatement(node)) return null;
  if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return null;

  const results: StructuralEntity[] = [];

  for (const decl of node.declarationList.declarations) {
    if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
    
    const callExpr = decl.initializer;
    let factoryFnName = '';
    
    if (ts.isIdentifier(callExpr.expression)) {
      factoryFnName = callExpr.expression.text;
    } else if (ts.isPropertyAccessExpression(callExpr.expression)) {
      factoryFnName = callExpr.expression.name.text;
    }

    if (!FACTORY_FUNCTIONS.has(factoryFnName)) continue;

    const isNextAuth = factoryFnName === 'NextAuth';
    const isDrizzle = factoryFnName.startsWith('create') && factoryFnName.endsWith('Schema');
    const isTable = factoryFnName === 'pgTable';

    const entityType = isNextAuth ? 'AUTH_INTERFACE' : (isDrizzle ? 'VALIDATOR_SCHEMA' : (isTable ? 'DB_SCHEMA' : 'FACTORY_EXPORT'));
    const patternId = isNextAuth ? 'contract.nextauth-factory-destructure' : (isDrizzle ? 'contract.drizzle-exported-validator' : (isTable ? 'contract.drizzle-table-schema' : 'contract.factory-export'));

    if (ts.isIdentifier(decl.name)) {
      // Direct assignment: export const schema = createInsertSchema(...)
      results.push({
        id: nextId(),
        name: `${entityType}: ${decl.name.text}`,
        type: 'CONTRACT',
        entityType,
        patternId,
        evidence: getEvidence(node),
      });
    } else if (ts.isObjectBindingPattern(decl.name)) {
      // Destructuring: export const { auth, signIn } = NextAuth(...)
      for (const element of decl.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          // Skip 'handlers' because they are usually internal NextAuth endpoints,
          // or we can just include them all. We will include them.
          results.push({
            id: nextId(),
            name: `${entityType}: ${element.name.text}`,
            type: 'CONTRACT',
            entityType,
            patternId,
            evidence: getEvidence(node),
          });
        }
      }
    }
  }

  return results.length > 0 ? results : null;
}
