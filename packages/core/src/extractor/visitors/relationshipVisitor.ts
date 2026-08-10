// packages/core/src/extractor/visitors/relationshipVisitor.ts
// Visitor for RELATIONSHIP primitives — known structural dependencies between units.

import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';
import { extractExpressRouterMount } from '../adapters/expressAdapter.js';
import { extractEventEmitterRelationship } from './eventEmitterVisitor.js';
import { resolveModulePath } from '../pathResolver.js';
import { stableEntityId } from '../index.js';
import { HTTP_CLIENT_IDENTIFIERS, DB_CLIENT_IDENTIFIERS } from './openConnectorVisitor.js';

/**
 * Inspects a single AST node and returns a RELATIONSHIP entity if it matches a known dependency pattern.
 *
 * Currently handled patterns:
 * - ImportDeclaration         (ES Module `import ... from '...'`)
 * - CallExpression (require)   (CommonJS `require('...')`)
 * - Express Router Mounts      (delegated to `extractExpressRouterMount`)
 * - EventEmitter Emits         (delegated to `extractEventEmitterRelationship`)
 * - Prototypal Inheritance     (`Object.create(...)`, `Object.setPrototypeOf(...)`)
 * - Inferred Method Calls      (e.g. `userService.createUser()`) with 3-tier confidence classification:
 *   - HIGH:   Root identifier matches a local ES import AND target exported method signature is verified.
 *   - MEDIUM: Root identifier matches a local import, but target method export signature cannot be verified (or external module).
 *   - LOW:    Root identifier does not match any local module import.
 *
 * Evidence chaining:
 * - Populates multiple EvidenceRecords (`syntax-call`, `import-match`, `target-signature`) for verified inferred relationships.
 *
 * @param node        The AST node to inspect.
 * @param sourceFile  Required to extract the module specifier text.
 * @param getEvidence Returns a populated EvidenceRecord for the given node.
 * @param nextId      Placeholder closure — replaced by stableEntityId() in the orchestrator.
 * @param repoRoot    The repository root for path resolution (defaults to empty string).
 * @param sourceId    The ID of the current enclosing boundary file (defaults to empty string).
 * @returns A StructuralEntity or null if the node does not match any RELATIONSHIP pattern.
 */
export function visitRelationship(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string,
  repoRoot: string = '',
  sourceId: string = ''
): StructuralEntity | null {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    const importLiteral = node.moduleSpecifier.text;
    const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot);
    let targetId: string | undefined = undefined;
    
    if (resolvedPath) {
      targetId = stableEntityId(resolvedPath, 'BOUNDARY', `File: ${resolvedPath}`);
    }
    
    return {
      id: nextId(),
      name: `Import: ${importLiteral}`,
      type: 'RELATIONSHIP',
      sourceId,
      targetId,
      status: 'DETERMINISTIC',
      confidence: 'HIGH',
      evidence: [
        { ...getEvidence(node), evidenceRole: 'syntax-call' }
      ],
    };
  }

  // CommonJS Require
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0) {
    const firstArg = node.arguments[0];
    if (ts.isStringLiteral(firstArg)) {
      const importLiteral = firstArg.text;
      const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot);
      let targetId: string | undefined = undefined;
      
      if (resolvedPath) {
        targetId = stableEntityId(resolvedPath, 'BOUNDARY', `File: ${resolvedPath}`);
      }

      return {
        id: nextId(),
        name: `Require: ${importLiteral}`,
        type: 'RELATIONSHIP',
        sourceId,
        targetId,
        status: 'DETERMINISTIC',
        confidence: 'HIGH',
        evidence: [
          { ...getEvidence(node), evidenceRole: 'syntax-call' }
        ],
      };
    }
  }

  const expressMount = extractExpressRouterMount(node, sourceFile, getEvidence, nextId);
  if (expressMount) {
    expressMount.sourceId = sourceId;
    expressMount.status = 'DETERMINISTIC';
    expressMount.confidence = 'HIGH';
    return expressMount;
  }

  const eventEmitterRelationship = extractEventEmitterRelationship(node, getEvidence, nextId);
  if (eventEmitterRelationship) {
    eventEmitterRelationship.sourceId = sourceId;
    eventEmitterRelationship.status = 'DETERMINISTIC';
    eventEmitterRelationship.confidence = 'HIGH';
    return eventEmitterRelationship;
  }

  // Object.create (Prototypal Inheritance)
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'Object' &&
    node.expression.name.text === 'create' &&
    node.arguments.length > 0
  ) {
    return {
      id: nextId(),
      name: `Inherits: ${node.arguments[0].getText(sourceFile)}`,
      type: 'RELATIONSHIP',
      sourceId,
      status: 'DETERMINISTIC',
      confidence: 'HIGH',
      evidence: [
        { ...getEvidence(node), evidenceRole: 'syntax-call' }
      ],
    };
  }

  // Object.setPrototypeOf (Prototypal Inheritance)
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'Object' &&
    node.expression.name.text === 'setPrototypeOf' &&
    node.arguments.length > 1
  ) {
    return {
      id: nextId(),
      name: `Inherits: ${node.arguments[1].getText(sourceFile)}`,
      type: 'RELATIONSHIP',
      sourceId,
      status: 'DETERMINISTIC',
      confidence: 'HIGH',
      evidence: [
        { ...getEvidence(node), evidenceRole: 'syntax-call' }
      ],
    };
  }

  // Inferred Method Calls (e.g. userController.createUser())
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    let rootIdentifier: ts.Identifier | null = null;
    let currentExpr: ts.Expression = node.expression.expression;
    while (currentExpr) {
      if (ts.isIdentifier(currentExpr)) {
        rootIdentifier = currentExpr;
        break;
      } else if (ts.isPropertyAccessExpression(currentExpr)) {
        currentExpr = currentExpr.expression;
      } else if (ts.isCallExpression(currentExpr)) {
        currentExpr = currentExpr.expression;
      } else {
        break;
      }
    }

    if (rootIdentifier) {
      const rootText = rootIdentifier.text;
      
      // Skip known open connectors (HTTP and DB clients)
      if (HTTP_CLIENT_IDENTIFIERS.has(rootText) || DB_CLIENT_IDENTIFIERS.has(rootText)) {
        return null;
      }

      // Check if rootIdentifier matches a local import
      let matchingImport: ts.ImportDeclaration | null = null;
      for (const statement of sourceFile.statements) {
        if (ts.isImportDeclaration(statement)) {
          const importClause = statement.importClause;
          if (importClause) {
            // Default import
            if (importClause.name && importClause.name.text === rootText) {
              matchingImport = statement;
              break;
            }
            // Named imports
            if (importClause.namedBindings) {
              if (ts.isNamedImports(importClause.namedBindings)) {
                if (importClause.namedBindings.elements.some(e => e.name.text === rootText)) {
                  matchingImport = statement;
                  break;
                }
              } else if (ts.isNamespaceImport(importClause.namedBindings)) {
                if (importClause.namedBindings.name.text === rootText) {
                  matchingImport = statement;
                  break;
                }
              }
            }
          }
        }
      }

      const methodName = node.expression.name.text;
      const callEvidence = { ...getEvidence(node), evidenceRole: 'syntax-call' as const };
      const evidences: EvidenceRecord[] = [callEvidence];

      if (matchingImport && ts.isStringLiteral(matchingImport.moduleSpecifier)) {
        const importLiteral = matchingImport.moduleSpecifier.text;
        const importStart = matchingImport.getStart(sourceFile);
        const { line: importLine } = sourceFile.getLineAndCharacterOfPosition(importStart);
        
        evidences.push({
          filePath: callEvidence.filePath,
          lineNumber: importLine + 1,
          snippet: matchingImport.getText(sourceFile).slice(0, 80).replace(/\s+/g, ' ').trim(),
          evidenceRole: 'import-match'
        });

        const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot);
        if (resolvedPath) {
          const targetId = stableEntityId(resolvedPath, 'BOUNDARY', `File: ${resolvedPath}`);
          const absoluteTargetPath = path.resolve(repoRoot, resolvedPath);
          
          // Verify export in target module
          let exportFound = false;
          let targetEvidence: EvidenceRecord | null = null;
          
          if (fs.existsSync(absoluteTargetPath)) {
            try {
              const targetSourceText = fs.readFileSync(absoluteTargetPath, 'utf8');
              const targetSourceFile = ts.createSourceFile(absoluteTargetPath, targetSourceText, ts.ScriptTarget.Latest, true);
              
              const visitTarget = (targetNode: ts.Node) => {
                if (exportFound) return;
                
                if (
                  (ts.isFunctionDeclaration(targetNode) || 
                   ts.isMethodDeclaration(targetNode) || 
                   ts.isPropertySignature(targetNode) || 
                   ts.isPropertyDeclaration(targetNode) || 
                   ts.isPropertyAssignment(targetNode)) &&
                  targetNode.name &&
                  ts.isIdentifier(targetNode.name) &&
                  targetNode.name.text === methodName
                ) {
                   exportFound = true;
                   const start = targetNode.getStart(targetSourceFile);
                   const { line } = targetSourceFile.getLineAndCharacterOfPosition(start);
                   targetEvidence = {
                     filePath: resolvedPath,
                     lineNumber: line + 1,
                     snippet: targetNode.getText(targetSourceFile).slice(0, 80).replace(/\s+/g, ' ').trim(),
                     evidenceRole: 'target-signature'
                   };
                }
                ts.forEachChild(targetNode, visitTarget);
              }
              visitTarget(targetSourceFile);
            } catch (e) {
              // Ignore parse errors on target file
            }
          }

          if (exportFound && targetEvidence) {
            evidences.push(targetEvidence);
            return {
              id: nextId(),
              name: `Call: ${rootText}.${methodName}()`,
              type: 'RELATIONSHIP',
              sourceId,
              targetId,
              status: 'INFERRED',
              confidence: 'HIGH',
              evidence: evidences,
            };
          } else {
            return {
              id: nextId(),
              name: `Call: ${rootText}.${methodName}()`,
              type: 'RELATIONSHIP',
              sourceId,
              targetId,
              status: 'INFERRED',
              confidence: 'MEDIUM',
              evidence: evidences,
            };
          }
        } else {
          // We have a matching import, but cannot resolve the path (e.g. built-in or external module)
          return {
            id: nextId(),
            name: `Call: ${rootText}.${methodName}()`,
            type: 'RELATIONSHIP',
            sourceId,
            status: 'INFERRED',
            confidence: 'MEDIUM',
            evidence: evidences,
          };
        }
      }

      // No matching import
      return {
        id: nextId(),
        name: `Call: ${rootText}.${methodName}()`,
        type: 'RELATIONSHIP',
        sourceId,
        status: 'INFERRED',
        confidence: 'LOW',
        evidence: evidences,
      };
    }
  }

  return null;
}
