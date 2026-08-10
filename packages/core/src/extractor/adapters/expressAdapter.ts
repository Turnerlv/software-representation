import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

const EXPRESS_ROUTE_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'all']);

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

export function extractExpressRouterMount(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  // Matches: app.use('/path', router) or app.use('/path', require('...'))
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    if (methodName === 'use' && node.arguments.length >= 2) {
      const firstArg = node.arguments[0];
      const secondArg = node.arguments[1];
      
      if (ts.isStringLiteral(firstArg)) {
        let target = 'Unknown Router';
        if (ts.isCallExpression(secondArg) && ts.isIdentifier(secondArg.expression) && secondArg.expression.text === 'require' && ts.isStringLiteral(secondArg.arguments[0])) {
          target = secondArg.arguments[0].text;
        } else if (ts.isIdentifier(secondArg)) {
          target = secondArg.text;
        }
        
        return {
          id: nextId(),
          name: `Express Mount: ${firstArg.text} -> ${target}`,
          type: 'RELATIONSHIP',
          evidence: getEvidence(node),
        };
      }
    }
  }

  return null;
}
