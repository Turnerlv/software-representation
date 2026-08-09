import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import {
  EvidenceRecord,
  RepresentationGraph,
  StructuralEntity,
} from '../types/index.js';
import { visitBoundary } from './visitors/boundaryVisitor.js';
import { visitContract } from './visitors/contractVisitor.js';
import { visitRelationship } from './visitors/relationshipVisitor.js';
import { visitOpenConnector } from './visitors/openConnectorVisitor.js';

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

/**
 * Produces a deterministic, stable 12-char hex ID for a structural entity.
 * Stable across re-runs of the same repo as long as the entity's type, file, and name don't change.
 */
function stableEntityId(filePath: string, type: string, name: string): string {
  return createHash('sha256')
    .update(`${type}:${filePath}:${name}`)
    .digest('hex')
    .slice(0, 12);
}

export function analyzeTarget(targetPath: string): RepresentationGraph {
  const files = collectFiles(targetPath);

  const boundaries: StructuralEntity[] = [];
  const contracts: StructuralEntity[] = [];
  const relationships: StructuralEntity[] = [];
  const openConnectors: StructuralEntity[] = [];

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
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
      const boundaryEntity = visitBoundary(node, getEvidence, () => '');
      if (boundaryEntity) {
        boundaryEntity.id = stableEntityId(relativePath, boundaryEntity.type, boundaryEntity.name);
        boundaries.push(boundaryEntity);
      }

      const contractEntity = visitContract(node, getEvidence, () => '');
      if (contractEntity) {
        contractEntity.id = stableEntityId(relativePath, contractEntity.type, contractEntity.name);
        contracts.push(contractEntity);
      }

      const relationshipEntity = visitRelationship(node, sourceFile, getEvidence, () => '');
      if (relationshipEntity) {
        relationshipEntity.id = stableEntityId(relativePath, relationshipEntity.type, relationshipEntity.name);
        relationships.push(relationshipEntity);
      }

      const openConnectorEntity = visitOpenConnector(node, sourceFile, getEvidence, () => '');
      if (openConnectorEntity) {
        openConnectorEntity.id = stableEntityId(relativePath, openConnectorEntity.type, openConnectorEntity.name);
        openConnectors.push(openConnectorEntity);
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
