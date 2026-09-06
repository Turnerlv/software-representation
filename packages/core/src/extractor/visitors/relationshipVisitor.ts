// packages/core/src/extractor/visitors/relationshipVisitor.ts
// Visitor for RELATIONSHIP primitives — known structural dependencies between units.

import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';
import { extractExpressRouterMount, extractExpressRouteMiddleware } from '../adapters/expressAdapter.js';
import { extractPayloadConfigRegistry, extractPayloadHooks } from '../adapters/payloadAdapter.js';

import { resolveModulePath } from '../pathResolver.js';
import { stableEntityId } from '../index.js';
import { HTTP_CLIENT_IDENTIFIERS, DB_CLIENT_IDENTIFIERS } from './openConnectorVisitor.js';
import { WorkspaceRegistry } from '../workspaceResolver.js';

/**
 * Inspects a single AST node and returns a RELATIONSHIP entity if it matches a known dependency pattern.
 *
 * Currently handled patterns:
 * - ImportDeclaration         (ES Module `import ... from '...'`)
 * - CallExpression (require)   (CommonJS `require('...')`)
 * - Express Router Mounts      (delegated to `extractExpressRouterMount`)
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
 * @param workspaceRegistry Optional registry of monorepo workspace packages.
 * @returns A StructuralEntity or null if the node does not match any RELATIONSHIP pattern.
 */
export function visitRelationship(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string,
  repoRoot: string = '',
  sourceId: string = '',
  workspaceRegistry?: WorkspaceRegistry
): StructuralEntity | StructuralEntity[] | null {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    const importLiteral = node.moduleSpecifier.text;
    const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot, workspaceRegistry);
    let targetId: string | undefined = undefined;
    
    if (resolvedPath) {
      targetId = stableEntityId(resolvedPath, 'BOUNDARY', `File: ${resolvedPath}`);
    } else if (!importLiteral.startsWith('.')) {
      targetId = stableEntityId(`package:${importLiteral}`, 'BOUNDARY', `Package: ${importLiteral}`);
    }
    
    return {
      id: nextId(),
      name: `Import: ${importLiteral}`,
      type: 'RELATIONSHIP',
      entityType: 'IMPORT', patternId: 'relationship.import-declaration',
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
      const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot, workspaceRegistry);
      let targetId: string | undefined = undefined;
      
      if (resolvedPath) {
        targetId = stableEntityId(resolvedPath, 'BOUNDARY', `File: ${resolvedPath}`);
      } else if (!importLiteral.startsWith('.')) {
        targetId = stableEntityId(`package:${importLiteral}`, 'BOUNDARY', `Package: ${importLiteral}`);
      }

      return {
        id: nextId(),
        name: `Require: ${importLiteral}`,
        type: 'RELATIONSHIP',
        entityType: 'REQUIRE', patternId: 'relationship.require-call',
        sourceId,
        targetId,
        status: 'DETERMINISTIC',
        confidence: 'HIGH',
        evidence: [
          { ...getEvidence(node), evidenceRole: 'syntax-call' }
        ],
      };
    } else {
      // Dynamic Require
      return {
        id: nextId(),
        name: `Dynamic Require: ${firstArg.getText(sourceFile)}`,
        type: 'RELATIONSHIP',
        entityType: 'REQUIRE', patternId: 'relationship.require-call',
        sourceId,
        status: 'DETERMINISTIC',
        confidence: 'MEDIUM',
        evidence: [
          { ...getEvidence(node), evidenceRole: 'syntax-call' }
        ],
      };
    }
  }

  // Dynamic Import (e.g. import(mod) or import('mod'))
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
    const firstArg = node.arguments[0];
    if (ts.isStringLiteral(firstArg)) {
      const importLiteral = firstArg.text;
      const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot, workspaceRegistry);
      let targetId: string | undefined = undefined;
      
      if (resolvedPath) {
        targetId = stableEntityId(resolvedPath, 'BOUNDARY', `File: ${resolvedPath}`);
      } else if (!importLiteral.startsWith('.')) {
        targetId = stableEntityId(`package:${importLiteral}`, 'BOUNDARY', `Package: ${importLiteral}`);
      }

      return {
        id: nextId(),
        name: `Import: ${importLiteral}`,
        type: 'RELATIONSHIP',
        entityType: 'IMPORT', patternId: 'relationship.dynamic-import',
        sourceId,
        targetId,
        status: 'DETERMINISTIC',
        confidence: 'HIGH',
        evidence: [
          { ...getEvidence(node), evidenceRole: 'syntax-call' }
        ],
      };
    } else {
      return {
        id: nextId(),
        name: `Dynamic Import: ${firstArg.getText(sourceFile)}`,
        type: 'RELATIONSHIP',
        entityType: 'IMPORT', patternId: 'relationship.dynamic-import',
        sourceId,
        status: 'DETERMINISTIC',
        confidence: 'MEDIUM',
        evidence: [
          { ...getEvidence(node), evidenceRole: 'syntax-call' }
        ],
      };
    }
  }

  const payloadRegistry = extractPayloadConfigRegistry(node, sourceFile, getEvidence, nextId);
  if (payloadRegistry) return payloadRegistry;

  const payloadHooks = extractPayloadHooks(node, sourceFile, getEvidence, nextId);
  if (payloadHooks) return payloadHooks;

  const expressMount = extractExpressRouterMount(node, sourceFile, getEvidence, nextId);
  if (expressMount) {
    expressMount.sourceId = sourceId;
    expressMount.status = 'DETERMINISTIC';
    expressMount.confidence = 'HIGH';
    return expressMount;
  }

  const expressRouteMiddlewares = extractExpressRouteMiddleware(node, sourceFile, getEvidence, nextId);
  if (expressRouteMiddlewares && expressRouteMiddlewares.length > 0) {
    for (const rw of expressRouteMiddlewares) {
      rw.sourceId = sourceId;
      rw.status = 'DETERMINISTIC';
      rw.confidence = 'HIGH';
    }
    return expressRouteMiddlewares;
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
    const argText = node.arguments[0].getText(sourceFile);
    if (argText === 'null' || argText === 'undefined') {
      return null; // Explicitly creating a prototype-less object is not a structural dependency
    }
    
    return {
      id: nextId(),
      name: `Inherits: ${argText}`,
      type: 'RELATIONSHIP',
      entityType: 'INHERITS', patternId: 'relationship.object-create',
      sourceId,
      targetId: stableEntityId(`prototype:${argText}`, 'BOUNDARY', `Prototype: ${argText}`),
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
    const argText = node.arguments[1].getText(sourceFile);
    return {
      id: nextId(),
      name: `Inherits: ${argText}`,
      type: 'RELATIONSHIP',
      entityType: 'INHERITS', patternId: 'relationship.object-setprototypeof',
      sourceId,
      targetId: stableEntityId(`prototype:${argText}`, 'BOUNDARY', `Prototype: ${argText}`),
      status: 'DETERMINISTIC',
      confidence: 'HIGH',
      evidence: [
        { ...getEvidence(node), evidenceRole: 'syntax-call' }
      ],
    };
  }

  /**
   * Prototype Mixin
   * Handles patterns where properties from a prototype are mixed into an object.
   *
   * @example
   * // Object.assign mixin
   * Object.assign(app, EventEmitter.prototype)
   *
   * @example
   * // merge-descriptors third-party mixin (3 arguments)
   * mixin(app, EventEmitter.prototype, false);
   */
  if (
    ts.isCallExpression(node) &&
    node.arguments.length >= 2 &&
    ts.isPropertyAccessExpression(node.arguments[1]) &&
    node.arguments[1].name.text === 'prototype'
  ) {
    return {
      id: nextId(),
      name: `Mixes: ${node.arguments[1].expression.getText(sourceFile)}`,
      type: 'RELATIONSHIP',
      entityType: 'MIXES', patternId: 'relationship.prototype-mixin',
      sourceId,
      status: 'DETERMINISTIC',
      confidence: 'MEDIUM',
      evidence: [
        { ...getEvidence(node), evidenceRole: 'syntax-call' }
      ],
    };
  }

  // Inferred Method Calls (e.g. userController.createUser())
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    let rootText: string | null = null;
    let currentExpr: ts.Expression = node.expression.expression;
    while (currentExpr) {
      if (ts.isIdentifier(currentExpr)) {
        rootText = currentExpr.text;
        break;
      } else if (currentExpr.kind === ts.SyntaxKind.ThisKeyword) {
        rootText = 'this';
        break;
      } else if (ts.isPropertyAccessExpression(currentExpr)) {
        currentExpr = currentExpr.expression;
      } else if (ts.isCallExpression(currentExpr)) {
        currentExpr = currentExpr.expression;
      } else {
        break;
      }
    }

    if (rootText) {
      
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

        const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot, workspaceRegistry);
        if (resolvedPath) {
          let targetId = stableEntityId(resolvedPath, 'BOUNDARY', `File: ${resolvedPath}`);
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

                   targetId = stableEntityId(resolvedPath, 'CONTRACT', `Exported Function: ${methodName}`);
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
              entityType: 'CALL', patternId: 'relationship.function-call',
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
              entityType: 'CALL', patternId: 'relationship.function-call',
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
            entityType: 'CALL', patternId: 'relationship.inferred-method-call',
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
        entityType: 'CALL', patternId: 'relationship.invoke-returned-function',
        sourceId,
        status: 'INFERRED',
        confidence: 'LOW',
        evidence: evidences,
      };
    }
  }

  // Inferred Function Calls (e.g. createUser())
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const rootText = node.expression.text;
    
    // Skip known open connectors or require
    if (rootText === 'require' || HTTP_CLIENT_IDENTIFIERS.has(rootText) || DB_CLIENT_IDENTIFIERS.has(rootText)) {
      return null;
    }

    // Check if it matches a local import
    let matchingImport: ts.ImportDeclaration | null = null;
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        const importClause = statement.importClause;
        if (importClause) {
          if (importClause.name && importClause.name.text === rootText) {
            matchingImport = statement;
            break;
          }
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

      const resolvedPath = resolveModulePath(importLiteral, sourceFile.fileName, repoRoot, workspaceRegistry);
      if (resolvedPath) {
        let targetId = stableEntityId(resolvedPath, 'BOUNDARY', `File: ${resolvedPath}`);
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
                 ts.isVariableDeclaration(targetNode) ||
                 ts.isPropertySignature(targetNode) ||
                 ts.isPropertyDeclaration(targetNode) ||
                 ts.isPropertyAssignment(targetNode)) &&
                targetNode.name &&
                ts.isIdentifier(targetNode.name) &&
                targetNode.name.text === rootText
              ) {
                 exportFound = true;

                 targetId = stableEntityId(resolvedPath, 'CONTRACT', `Exported Function: ${rootText}`);
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
            name: `Call: ${rootText}()`,
            type: 'RELATIONSHIP',
            entityType: 'CALL', patternId: 'relationship.function-call',
            sourceId,
            targetId,
            status: 'INFERRED',
            confidence: 'HIGH',
            evidence: evidences,
          };
        } else {
          return {
            id: nextId(),
            name: `Call: ${rootText}()`,
            type: 'RELATIONSHIP',
            entityType: 'CALL', patternId: 'relationship.function-call',
            sourceId,
            targetId,
            status: 'INFERRED',
            confidence: 'MEDIUM',
            evidence: evidences,
          };
        }
      } else {
        return {
          id: nextId(),
          name: `Call: ${rootText}()`,
          type: 'RELATIONSHIP',
          entityType: 'CALL', patternId: 'relationship.inferred-method-call',
          sourceId,
          status: 'INFERRED',
          confidence: 'MEDIUM',
          evidence: evidences,
        };
      }
    }

    return {
      id: nextId(),
      name: `Call: ${rootText}()`,
      type: 'RELATIONSHIP',
      entityType: 'CALL', patternId: 'relationship.invoke-returned-function',
      sourceId,
      status: 'INFERRED',
      confidence: 'LOW',
      evidence: evidences,
    };
  }

  // Inferred Invocation of a Returned Function (e.g. passport.authenticate(...)() or require('...')())
  if (ts.isCallExpression(node) && ts.isCallExpression(node.expression)) {
    const innerCall = node.expression;
    let innerName = 'Function';
    if (ts.isIdentifier(innerCall.expression)) {
      innerName = innerCall.expression.text;
    } else if (ts.isPropertyAccessExpression(innerCall.expression)) {
      innerName = innerCall.expression.name.text;
    }

    const callEvidence = { ...getEvidence(node), evidenceRole: 'syntax-call' as const };
    const evidences: EvidenceRecord[] = [callEvidence];

    return {
      id: nextId(),
      name: `Call: ${innerName}()()`,
      type: 'RELATIONSHIP',
      entityType: 'CALL', patternId: 'relationship.invoke-required-function',
      sourceId,
      status: 'INFERRED',
      confidence: 'LOW',
      evidence: evidences,
    };
  }

  return null;
}
