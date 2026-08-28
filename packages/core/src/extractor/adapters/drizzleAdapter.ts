// packages/core/src/extractor/adapters/drizzleAdapter.ts
// Framework-specific adapter for Drizzle ORM.
//
// Structural patterns handled:
//   - Drizzle query chains -> OPEN_CONNECTOR (e.g. `db.select().from(users).where(...)`)

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/** Set of query entrypoint method names in Drizzle ORM */
const DRIZZLE_ENTRY_METHODS = new Set(['select', 'insert', 'update', 'delete']);

/**
 * Recursively unwinds a property access or call expression chain to find its root identifier
 * and the first method called on it.
 *
 * Example: `db.select().from(users)` -> { rootName: 'db', entryMethod: 'select' }
 */
function unwindChain(node: ts.Expression): { rootName: string | null; entryMethod: string | null } {
  let current: ts.Expression = node;
  let entryMethod: string | null = null;

  while (current) {
    if (ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(current)) {
      if (!entryMethod) {
        entryMethod = current.name.text;
      } else {
        // If we already found a method further down the chain, update it as we go up
        entryMethod = current.name.text;
      }
      current = current.expression;
      continue;
    }
    if (ts.isIdentifier(current)) {
      return { rootName: current.text, entryMethod };
    }
    break;
  }
  return { rootName: null, entryMethod: null };
}

/**
 * Extracts a Drizzle query chain as a single OPEN_CONNECTOR.
 *
 * Looks for method chains starting with `db.select`, `db.insert`, `db.update`, or `db.delete`.
 * This must be called from the topmost `CallExpression` in the chain to avoid emitting
 * multiple connectors for `db.select()` and `db.select().from(...)`.
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Returns an EvidenceRecord for the given node.
 * @param nextId      Placeholder ID closure.
 * @returns An OPEN_CONNECTOR entity, or null.
 */
export function extractDrizzleQueryChain(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (!ts.isCallExpression(node)) return null;
  
  // We only want to process the TOPMOST call in a chain.
  // If our parent is a property access whose parent is a call expression, we are an inner link.
  if (node.parent && ts.isPropertyAccessExpression(node.parent) && node.parent.parent && ts.isCallExpression(node.parent.parent)) {
    return null;
  }

  const { rootName, entryMethod } = unwindChain(node);
  
  if (entryMethod && DRIZZLE_ENTRY_METHODS.has(entryMethod)) {
    // Restrict to common Drizzle root identifiers to avoid false positives (e.g. router.delete)
    if (rootName && ['db', 'tx', 'trx', 'drizzle'].includes(rootName)) {
      return {
        id: nextId(),
        name: `Drizzle Query: ${entryMethod}()`,
        type: 'OPEN_CONNECTOR',
        entityType: 'DB_QUERY',
        patternId: 'open-connector.drizzle-query-chain',
        evidence: getEvidence(node),
      };
    }
  }

  return null;
}
