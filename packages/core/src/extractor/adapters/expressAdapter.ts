// packages/core/src/extractor/adapters/expressAdapter.ts
// Framework-specific AST extraction adapter for Express.js route, mount, parameter, and content negotiation patterns.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/**
 * Set of supported Express HTTP routing method names.
 * Matched against method invocation identifiers (e.g. `app.get`, `router.post`).
 */
const EXPRESS_ROUTE_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'all', 'route']);

/**
 * Extracts an Express route handler definition as a CONTRACT primitive entity.
 *
 * Matches expressions like:
 * - `app.get('/path', handler)`
 * - `router.post('/api/v1/users', controller.create)`
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns A CONTRACT StructuralEntity for the route, or null if node does not match.
 */
export function extractExpressRoute(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    
    // Express Route Definition: e.g. app.get('/path', handler)
    if (EXPRESS_ROUTE_METHODS.has(methodName) && node.arguments.length >= 1) {
      const firstArg = node.arguments[0];
      if (ts.isStringLiteral(firstArg)) {
        return {
          id: nextId(),
          name: `Express Route: ${methodName.toUpperCase()} ${firstArg.text}`,
          type: 'CONTRACT',
          evidence: getEvidence(node),
        };
      }
    }
  }

  return null;
}

/**
 * Extracts an Express router mount or middleware registration as a RELATIONSHIP primitive entity.
 *
 * Matches expressions like:
 * - `app.use('/api', apiRouter)` -> `Express Mount: /api -> apiRouter`
 * - `app.use(express.json())`     -> `Express Mount: Root -> express.json()`
 * - `app.use(require('./routes'))` -> `Express Mount: Root -> ./routes`
 *
 * @param node        The AST node to inspect.
 * @param sourceFile  TypeScript SourceFile object used for text extraction.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns A RELATIONSHIP StructuralEntity for the mount, or null if node does not match.
 */
export function extractExpressRouterMount(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  // Matches: app.use('/path', router), app.use(middleware), etc.
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    if (methodName === 'use' && node.arguments.length >= 1) {
      const firstArg = node.arguments[0];
      
      let pathPrefix = 'Root';
      let targetNode = firstArg;
      
      if (ts.isStringLiteral(firstArg) && node.arguments.length >= 2) {
        pathPrefix = firstArg.text;
        targetNode = node.arguments[1];
      }

      let target = 'Unknown Middleware';
      if (ts.isCallExpression(targetNode)) {
        if (ts.isIdentifier(targetNode.expression) && targetNode.expression.text === 'require' && ts.isStringLiteral(targetNode.arguments[0])) {
          target = targetNode.arguments[0].text;
        } else if (ts.isIdentifier(targetNode.expression)) {
          target = `${targetNode.expression.text}()`;
        } else if (ts.isPropertyAccessExpression(targetNode.expression)) {
          if (ts.isIdentifier(targetNode.expression.expression)) {
            target = `${targetNode.expression.expression.text}.${targetNode.expression.name.text}()`;
          } else {
            target = `${targetNode.expression.name.text}()`;
          }
        }
      } else if (ts.isIdentifier(targetNode)) {
        target = targetNode.text;
      } else if (ts.isFunctionExpression(targetNode) || ts.isArrowFunction(targetNode)) {
        target = 'Inline Middleware';
      }
      
      return {
        id: nextId(),
        name: `Express Mount: ${pathPrefix} -> ${target}`,
        type: 'RELATIONSHIP',
        evidence: getEvidence(node),
      };
    }
  }

  return null;
}

/**
 * Extracts an Express route parameter trigger definition (`app.param(...)` or `router.param(...)`)
 * as a CONTRACT primitive entity.
 *
 * Matches expressions like:
 * - `app.param('user', (req, res, next, id) => { ... })`
 * - `router.param(['id', 'page'], callback)`
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns A CONTRACT StructuralEntity for the route parameter, or null if node does not match.
 */
export function extractExpressRouteParameter(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    if (methodName === 'param' && node.arguments.length >= 2) {
      const firstArg = node.arguments[0];
      let paramName = 'Unknown';
      if (ts.isStringLiteral(firstArg)) {
        paramName = firstArg.text;
      } else if (ts.isArrayLiteralExpression(firstArg)) {
        paramName = firstArg.elements
          .filter(ts.isStringLiteral)
          .map(e => e.text)
          .join(', ');
      }

      return {
        id: nextId(),
        name: `Express Param: ${paramName}`,
        type: 'CONTRACT',
        evidence: getEvidence(node),
      };
    }
  }

  return null;
}

/**
 * Extracts an Express content negotiation block (`res.format({ 'application/json': ... })`)
 * as a CONTRACT primitive entity.
 *
 * Matches expressions like:
 * - `res.format({ 'application/json': fn1, default: fn2 })`
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns A CONTRACT StructuralEntity for content negotiation, or null if node does not match.
 */
export function extractExpressContentNegotiation(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    if (methodName === 'format' && node.arguments.length === 1) {
      const arg = node.arguments[0];
      if (ts.isObjectLiteralExpression(arg)) {
        const types = arg.properties
          .map(prop => {
            if (ts.isPropertyAssignment(prop)) {
              if (ts.isStringLiteral(prop.name)) {
                return prop.name.text;
              } else if (ts.isIdentifier(prop.name)) {
                return prop.name.text;
              }
            }
            return null;
          })
          .filter(Boolean);

        return {
          id: nextId(),
          name: `Express Content Negotiation: ${types.join(', ')}`,
          type: 'CONTRACT',
          evidence: getEvidence(node),
        };
      }
    }
  }

  return null;
}

/**
 * Extracts an Express file response (`res.sendFile(...)` or `res.download(...)`)
 * as an OPEN_CONNECTOR primitive entity representing a filesystem I/O boundary.
 *
 * Matches expressions like:
 * - `res.sendFile('/path/to/file')`
 * - `res.download('/path/to/file')`
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns An OPEN_CONNECTOR StructuralEntity for the file response, or null if node does not match.
 */
export function extractExpressFileResponse(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    if ((methodName === 'sendFile' || methodName === 'download') && node.arguments.length >= 1) {
      return {
        id: nextId(),
        name: `Express File Response: ${methodName}`,
        type: 'OPEN_CONNECTOR',
        evidence: getEvidence(node),
      };
    }
  }

  return null;
}
