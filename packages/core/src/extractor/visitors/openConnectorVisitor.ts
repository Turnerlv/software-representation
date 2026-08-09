import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/**
 * Known HTTP / network client root identifiers.
 * Matched against the root object of a call expression (e.g. `axios` in `axios.get(...)`).
 */
export const HTTP_CLIENT_IDENTIFIERS = new Set([
  'fetch',
  'axios',
  'got',
  'superagent',
  'needle',
  'request',
  'ky',
  'XMLHttpRequest',
]);

/**
 * Known database, ORM, and message-broker root identifiers.
 * Matched against the root object of a call expression (e.g. `prisma` in `prisma.user.findMany(...)`).
 */
export const DB_CLIENT_IDENTIFIERS = new Set([
  // ORMs / query builders
  'prisma',
  'knex',
  'mongoose',
  'sequelize',
  'typeorm',
  'drizzle',
  'supabase',
  // Raw DB clients
  'pg',
  'mysql',
  'mysql2',
  'sqlite3',
  'redis',
  'dynamodb',
  // Message brokers / queues
  'bull',
  'bullmq',
  'amqplib',
  'kafka',
  'nats',
]);

/**
 * Extracts the root object identifier from a call expression.
 *
 * Examples:
 *   fetch(...)                  → 'fetch'
 *   axios.get(...)              → 'axios'
 *   prisma.user.findMany(...)   → 'prisma'
 *   queryString.parse(...)      → 'queryString'  ← correctly NOT in either allowlist
 */
function getRootIdentifier(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return getRootIdentifier(expression.expression);
  }
  return null;
}

export function visitOpenConnector(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (!ts.isCallExpression(node)) {
    return null;
  }

  const rootId = getRootIdentifier(node.expression);
  if (!rootId) {
    return null;
  }

  if (HTTP_CLIENT_IDENTIFIERS.has(rootId)) {
    const callText = node.expression.getText(sourceFile);
    return {
      id: nextId(),
      name: `HTTP Call: ${callText}`,
      type: 'OPEN_CONNECTOR',
      evidence: getEvidence(node),
    };
  }

  if (DB_CLIENT_IDENTIFIERS.has(rootId)) {
    const callText = node.expression.getText(sourceFile);
    return {
      id: nextId(),
      name: `DB Call: ${callText}`,
      type: 'OPEN_CONNECTOR',
      evidence: getEvidence(node),
    };
  }

  return null;
}

