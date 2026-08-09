import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { createSourceFile } from './index.js';
import {
  EvidenceRecord,
  RepresentationGraph,
  StructuralEntity,
} from './types.js';

export function collectFiles(targetPath: string): string[] {
  const absolutePath = path.resolve(targetPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Target path does not exist: ${targetPath}`);
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    return [absolutePath];
  }

  const files: string[] = [];

  function walkDir(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'build'
        ) {
          continue;
        }
        walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walkDir(absolutePath);
  return files;
}

export function analyzeTarget(targetPath: string): RepresentationGraph {
  const files = collectFiles(targetPath);

  const boundaries: StructuralEntity[] = [];
  const contracts: StructuralEntity[] = [];
  const relationships: StructuralEntity[] = [];
  const openConnectors: StructuralEntity[] = [];

  let entityCounter = 1;

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    const relativePath = path.relative(process.cwd(), filePath) || filePath;

    function getEvidence(node: ts.Node): EvidenceRecord {
      const start = node.getStart(sourceFile);
      const { line } = sourceFile.getLineAndCharacterOfPosition(start);
      const fullText = node.getText(sourceFile);
      const snippet = fullText.slice(0, 80).replace(/\s+/g, ' ').trim();

      return {
        filePath: relativePath,
        lineNumber: line + 1,
        snippet,
      };
    }

    function visit(node: ts.Node) {
      // 1. BOUNDARIES: Class Declarations & Module Declarations
      if (ts.isClassDeclaration(node) && node.name) {
        boundaries.push({
          id: `b_${entityCounter++}`,
          name: `Class: ${node.name.text}`,
          type: 'BOUNDARY',
          evidence: getEvidence(node),
        });
      } else if (ts.isModuleDeclaration(node)) {
        boundaries.push({
          id: `b_${entityCounter++}`,
          name: `Module: ${node.name.text}`,
          type: 'BOUNDARY',
          evidence: getEvidence(node),
        });
      }

      // 2. CONTRACTS: Interfaces, Type Aliases, Exported Functions
      if (ts.isInterfaceDeclaration(node) && node.name) {
        contracts.push({
          id: `c_${entityCounter++}`,
          name: `Interface: ${node.name.text}`,
          type: 'CONTRACT',
          evidence: getEvidence(node),
        });
      } else if (ts.isTypeAliasDeclaration(node) && node.name) {
        contracts.push({
          id: `c_${entityCounter++}`,
          name: `Type: ${node.name.text}`,
          type: 'CONTRACT',
          evidence: getEvidence(node),
        });
      } else if (
        ts.isFunctionDeclaration(node) &&
        node.name &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        contracts.push({
          id: `c_${entityCounter++}`,
          name: `Exported Function: ${node.name.text}`,
          type: 'CONTRACT',
          evidence: getEvidence(node),
        });
      }

      // 3. RELATIONSHIPS: Import Declarations
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
        relationships.push({
          id: `r_${entityCounter++}`,
          name: `Import: ${moduleSpecifier}`,
          type: 'RELATIONSHIP',
          evidence: getEvidence(node),
        });
      }

      // 4. OPEN CONNECTORS: External HTTP/API/DB calls (fetch, axios, db, etc.)
      if (ts.isCallExpression(node)) {
        const expressionText = node.expression.getText(sourceFile);

        const isFetchOrNetwork =
          expressionText === 'fetch' ||
          expressionText.startsWith('axios') ||
          expressionText.includes('http') ||
          expressionText.includes('db.') ||
          expressionText.includes('query');

        if (isFetchOrNetwork) {
          openConnectors.push({
            id: `oc_${entityCounter++}`,
            name: `External Call: ${expressionText}`,
            type: 'OPEN_CONNECTOR',
            evidence: getEvidence(node),
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return {
    version: '1.0.0',
    analyzedAt: new Date().toISOString(),
    boundaries,
    contracts,
    relationships,
    openConnectors,
  };
}
