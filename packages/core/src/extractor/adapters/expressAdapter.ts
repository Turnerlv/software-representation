// packages/core/src/extractor/adapters/expressAdapter.ts
// Framework-specific AST extraction adapter for Express.js route, mount, parameter, and content negotiation patterns.

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';
import { stableEntityId } from '../index.js';

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
    // Avoid false positives like app.get('env') or req.get('Range') which have only 1 arg and are getters
    if (EXPRESS_ROUTE_METHODS.has(methodName) && node.arguments.length >= 1) {
      const firstArg = node.arguments[0];
      if (ts.isStringLiteral(firstArg) || ts.isRegularExpressionLiteral(firstArg)) {
        const pathText = firstArg.text;
        // Getter calls like req.get('Range') or app.get('env') have 1 arg and non-path strings
        if (methodName === 'get' && node.arguments.length === 1 && !pathText.startsWith('/')) {
          return null;
        }
        // Only consider it a route if there are at least 2 arguments or it starts with '/' (or is a regex)
        if (node.arguments.length >= 2 || pathText.startsWith('/') || ts.isRegularExpressionLiteral(firstArg)) {
          return {
            id: nextId(),
            name: `Express Route: ${methodName.toUpperCase()} ${pathText}`,
            type: 'CONTRACT',
            entityType: 'HTTP_ENDPOINT', patternId: 'contract.express-route', 
            evidence: getEvidence(node),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Extracts inline middleware arguments from Express route handlers as RELATIONSHIP primitive entities.
 *
 * Matches expressions like:
 * - `router.get('/path', auth.optional, handler)`
 *
 * @param node        The AST node to inspect.
 * @param sourceFile  TypeScript SourceFile object used for text extraction.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns An array of RELATIONSHIP StructuralEntities for each middleware, or null if node does not match.
 */
export function extractExpressRouteMiddleware(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity[] | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    
    if (EXPRESS_ROUTE_METHODS.has(methodName) && node.arguments.length >= 3) {
      const firstArg = node.arguments[0];
      if (ts.isStringLiteral(firstArg) || ts.isRegularExpressionLiteral(firstArg)) {
        const pathText = firstArg.text;
        if (methodName === 'get' && !pathText.startsWith('/') && !ts.isRegularExpressionLiteral(firstArg)) {
           return null;
        }

        const entities: StructuralEntity[] = [];
        
        // Loop from second arg to second-to-last arg (last arg is the handler)
        for (let i = 1; i < node.arguments.length - 1; i++) {
          const middlewareArg = node.arguments[i];
          let target = 'Unknown Middleware';
          
          if (ts.isIdentifier(middlewareArg)) {
            target = middlewareArg.text;
          } else if (ts.isPropertyAccessExpression(middlewareArg)) {
            if (ts.isIdentifier(middlewareArg.expression)) {
              target = `${middlewareArg.expression.text}.${middlewareArg.name.text}`;
            } else {
              target = middlewareArg.name.text;
            }
          } else if (ts.isCallExpression(middlewareArg)) {
            if (ts.isIdentifier(middlewareArg.expression)) {
              target = `${middlewareArg.expression.text}()`;
            } else if (ts.isPropertyAccessExpression(middlewareArg.expression)) {
              target = `${middlewareArg.expression.name.text}()`;
            }
          } else if (ts.isFunctionExpression(middlewareArg) || ts.isArrowFunction(middlewareArg)) {
            target = 'Inline Middleware';
          } else {
            target = middlewareArg.getText(sourceFile);
          }
          
          entities.push({
            id: nextId(),
            name: `Express Mount: ${pathText} -> ${target}`,
            type: 'RELATIONSHIP',
            entityType: 'INTERCEPTS', patternId: 'relationship.express-route-middleware', 
            targetId: stableEntityId(`middleware:${target}`, 'BOUNDARY', `Middleware: ${target}`),
            evidence: getEvidence(node),
          });
        }
        
        if (entities.length > 0) {
          return entities;
        }
      }
    }
  }

  return null;
}

function parseExpressUseTarget(node: ts.CallExpression, sourceFile: ts.SourceFile) {
  const firstArg = node.arguments[0];
  let pathPrefix = 'Root';
  let targetNode = firstArg;
  
  if ((ts.isStringLiteral(firstArg) || ts.isRegularExpressionLiteral(firstArg)) && node.arguments.length >= 2) {
    pathPrefix = firstArg.text;
    targetNode = node.arguments[1];
  }

  let target = 'Unknown Middleware';
  let isMiddleware = true;
  
  if (ts.isCallExpression(targetNode)) {
    if (ts.isIdentifier(targetNode.expression) && targetNode.expression.text === 'require' && ts.isStringLiteral(targetNode.arguments[0])) {
      target = targetNode.arguments[0].text;
      isMiddleware = false; // Requiring a file is usually mounting a router
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
    if (target.toLowerCase().includes('router')) {
      isMiddleware = false;
    }
  } else if (ts.isFunctionExpression(targetNode) || ts.isArrowFunction(targetNode)) {
    target = 'Inline Middleware';
  }
  
  return { pathPrefix, target, isMiddleware };
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
      const { pathPrefix, target, isMiddleware } = parseExpressUseTarget(node, sourceFile);
      
      return {
        id: nextId(),
        name: `Express Mount: ${pathPrefix} -> ${target}`,
        type: 'RELATIONSHIP',
        entityType: isMiddleware ? 'INTERCEPTS' : 'MOUNTS', patternId: isMiddleware ? 'relationship.express-route-middleware' : 'relationship.express-router-mount', 
        targetId: stableEntityId(`middleware:${target}`, 'BOUNDARY', `Middleware: ${target}`),
        evidence: getEvidence(node),
      };
    }
  }

  return null;
}

/**
 * Extracts an Express middleware as a BOUNDARY primitive entity.
 *
 * @param node        The AST node to inspect.
 * @param sourceFile  TypeScript SourceFile object used for text extraction.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns A BOUNDARY StructuralEntity for the middleware, or null if node does not match.
 */
export function extractExpressMiddlewareBoundary(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    if (node.expression.name.text === 'use' && node.arguments.length >= 1) {
      const { target, isMiddleware } = parseExpressUseTarget(node, sourceFile);
      if (isMiddleware) {
        return {
          id: nextId(),
          name: `Middleware: ${target}`,
          type: 'BOUNDARY',
          entityType: 'MIDDLEWARE', patternId: 'boundary.express-middleware', 
          evidence: getEvidence(node),
        };
      }
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
        entityType: 'HTTP_ENDPOINT', patternId: 'contract.express-route-parameter', 
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
          entityType: 'HTTP_ENDPOINT', patternId: 'contract.express-content-negotiation', 
          evidence: getEvidence(node),
        };
      }
    }
  }

  return null;
}

/**
 * Extracts an Express response boundary (file, render, redirect)
 * as an OPEN_CONNECTOR primitive entity representing a structural boundary.
 *
 * Matches expressions like:
 * - `res.sendFile('/path/to/file')`
 * - `res.download('/path/to/file')`
 * - `res.render('viewName')`
 * - `res.redirect('/path')`
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns An OPEN_CONNECTOR StructuralEntity for the response, or null if node does not match.
 */
export function extractExpressResponseConnector(
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
        entityType: 'FILE_RESPONSE', patternId: 'open-connector.express-response', 
        evidence: getEvidence(node),
      };
    } else if (methodName === 'render' && node.arguments.length >= 1) {
      let isExpressRes = false;
      if (ts.isIdentifier(node.expression.expression)) {
        const rootName = node.expression.expression.text;
        if (['res', 'app'].includes(rootName)) {
          isExpressRes = true;
        }
      }

      if (isExpressRes) {
        return {
          id: nextId(),
          name: `Express View Render`,
          type: 'OPEN_CONNECTOR',
          entityType: 'VIEW_RENDER', patternId: 'open-connector.express-response', 
          evidence: getEvidence(node),
        };
      }
    } else if (methodName === 'redirect' && node.arguments.length >= 1) {
      let isExpressRes = false;
      if (ts.isIdentifier(node.expression.expression)) {
        const rootName = node.expression.expression.text;
        if (['res'].includes(rootName)) {
          isExpressRes = true;
        }
      }

      if (isExpressRes) {
        return {
          id: nextId(),
          name: `Express Redirect`,
          type: 'OPEN_CONNECTOR',
          entityType: 'REDIRECT', patternId: 'open-connector.express-response-redirect', 
          evidence: getEvidence(node),
        };
      }
    } else if (methodName === 'send' || methodName === 'json' || methodName === 'jsonp' || methodName === 'sendStatus') {
      let isExpressRes = false;
      if (ts.isIdentifier(node.expression.expression)) {
        const rootName = node.expression.expression.text;
        if (['res'].includes(rootName)) {
          isExpressRes = true;
        }
      } else if (ts.isCallExpression(node.expression.expression)) {
        if (ts.isPropertyAccessExpression(node.expression.expression.expression)) {
          if (ts.isIdentifier(node.expression.expression.expression.expression)) {
            const rootName = node.expression.expression.expression.expression.text;
            if (['res'].includes(rootName)) {
              isExpressRes = true;
            }
          }
        }
      }
      
      if (isExpressRes) {
        return {
          id: nextId(),
          name: `Express HTTP Response: ${methodName}`,
          type: 'OPEN_CONNECTOR',
          entityType: 'HTTP_RESPONSE', patternId: 'open-connector.express-response', 
          evidence: getEvidence(node),
        };
      }
    } else if (methodName === 'set' || methodName === 'setHeader' || methodName === 'header') {
      let isExpressRes = false;
      if (ts.isIdentifier(node.expression.expression)) {
        const rootName = node.expression.expression.text;
        if (['res'].includes(rootName)) {
          isExpressRes = true;
        }
      }

      if (isExpressRes) {
        let headerName = 'Unknown';
        if (node.arguments.length >= 1 && ts.isStringLiteral(node.arguments[0])) {
          headerName = node.arguments[0].text;
        }

        return {
          id: nextId(),
          name: `Express Response Header: ${headerName}`,
          type: 'OPEN_CONNECTOR',
          entityType: 'HTTP_RESPONSE', patternId: 'open-connector.express-response-header', 
          evidence: getEvidence(node),
        };
      }
    }
  }

  return null;
}

/**
 * Extracts an Express app listener (`app.listen(...)`)
 * as an OPEN_CONNECTOR primitive entity representing a network boundary.
 *
 * Matches expressions like:
 * - `app.listen(3000)`
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns An OPEN_CONNECTOR StructuralEntity for the listener, or null if node does not match.
 */
export function extractExpressAppListen(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    if (methodName === 'listen') {
      let isExpressApp = false;
      if (ts.isIdentifier(node.expression.expression)) {
        const rootName = node.expression.expression.text;
        // Typically 'app' or 'server'
        if (['app', 'server'].includes(rootName)) {
          isExpressApp = true;
        }
      }

      if (isExpressApp) {
        return {
          id: nextId(),
          name: `Express App Listen`,
          type: 'OPEN_CONNECTOR',
          entityType: 'NETWORK_LISTEN', patternId: 'open-connector.express-app-listen', 
          evidence: getEvidence(node),
        };
      }
    }
  }

  return null;
}

/**
 * Extracts an Express response cookie operation (`res.cookie(...)` or `res.clearCookie(...)`)
 * as an OPEN_CONNECTOR primitive entity representing client-side state interaction.
 *
 * Matches expressions like:
 * - `res.cookie('remember', 1)`
 * - `res.clearCookie('remember')`
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns An OPEN_CONNECTOR StructuralEntity for the cookie operation, or null if node does not match.
 */
export function extractExpressResponseCookie(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    if (methodName === 'cookie' || methodName === 'clearCookie') {
      let isExpressRes = false;
      if (ts.isIdentifier(node.expression.expression)) {
        const rootName = node.expression.expression.text;
        if (['res'].includes(rootName)) {
          isExpressRes = true;
        }
      }

      if (isExpressRes) {
        let cookieName = 'Unknown';
        if (node.arguments.length >= 1 && ts.isStringLiteral(node.arguments[0])) {
          cookieName = node.arguments[0].text;
        }

        return {
          id: nextId(),
          name: `Express Response Cookie: ${cookieName}`,
          type: 'OPEN_CONNECTOR',
          entityType: 'HTTP_RESPONSE', patternId: 'open-connector.express-response-cookie', 
          evidence: getEvidence(node),
        };
      }
    }
  }

  return null;
}

/**
 * Extracts Express dynamic methods from the iteration loop (methods.forEach).
 * 
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns An array of CONTRACT StructuralEntity for the endpoints, or null if node does not match.
 */
export function extractExpressDynamicMethods(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity[] | null {
  // Matches: methods.forEach(function (method) { app[method] = function (path) { ... } })
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'methods' &&
    node.expression.name.text === 'forEach'
  ) {
    const entities: StructuralEntity[] = [];
    for (const method of EXPRESS_ROUTE_METHODS) {
      entities.push({
        id: nextId(),
        name: `Express Route: ${method.toUpperCase()} (Dynamic)`,
        type: 'CONTRACT',
        entityType: 'HTTP_ENDPOINT', patternId: 'contract.express-dynamic-methods', 
        evidence: getEvidence(node),
      });
    }
    return entities;
  }
  return null;
}
