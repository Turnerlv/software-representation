// packages/core/src/extractor/index.ts
// Extraction orchestrator — walks source files, dispatches to visitors, and assembles the RepresentationGraph.

import { createHash } from 'crypto';
import fs from 'fs';
import ignore from 'ignore';
import path from 'path';
import ts from 'typescript';
import {
  EvidenceRecord,
  RepresentationGraph,
  StructuralNode,
  StructuralEdge,
} from '../types/index.js';
import { visitBoundary } from './visitors/boundaryVisitor.js';
import { visitContract } from './visitors/contractVisitor.js';
import { visitRelationship } from './visitors/relationshipVisitor.js';
import { visitOpenConnector } from './visitors/openConnectorVisitor.js';
import { classifyNextjsFile, NextjsFileRole } from './adapters/nextjsAdapter.js';
import { buildWorkspaceRegistry, WorkspaceRegistry } from './workspaceResolver.js';

/**
 * Recursively collects all TypeScript and JavaScript source files under the given path.
 *
 * Skips node_modules, .git, dist, and build directories automatically.
 * If targetPath points to a single file, that file is returned directly.
 *
 * @param targetPath  Absolute or relative path to a file or directory.
 * @returns Sorted list of absolute file paths to analyze.
 */
export function collectFiles(targetPath: string): string[] {
  const absolutePath = path.resolve(targetPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Target path does not exist: ${targetPath}`);
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    return [absolutePath];
  }

  // Load .chompignore if it exists
  const ig = (ignore as any).default ? (ignore as any).default() : (ignore as any)();
  const ignorePath = path.join(absolutePath, '.chompignore');
  if (fs.existsSync(ignorePath)) {
    ig.add(fs.readFileSync(ignorePath, 'utf8'));
  }

  const files: string[] = [];

  function walkDir(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      // Calculate path relative to root target for ignore testing
      const relativePath = path.relative(absolutePath, fullPath);

      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === '.next' ||
          entry.name === '.turbo' ||
          entry.name === 'coverage' ||
          entry.name === 'test' ||
          entry.name === 'tests' ||
          entry.name === '__tests__' ||
          entry.name === '__mocks__' ||
          entry.name === 'examples' ||
          entry.name === 'example' ||
          entry.name === 'benchmarks' ||
          entry.name === 'benchmark'
        ) {
          continue;
        }

        // Apply .chompignore for directories
        if (fs.existsSync(ignorePath) && ig.ignores(relativePath + '/')) {
          continue;
        }

        walkDir(fullPath);
      } else if (entry.isFile()) {
        // Apply .chompignore for files
        if (fs.existsSync(ignorePath) && ig.ignores(relativePath)) {
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
          const lowerName = entry.name.toLowerCase();
          if (
            !lowerName.includes('.test.') &&
            !lowerName.includes('.spec.') &&
            !lowerName.includes('.mock.') &&
            !lowerName.includes('.d.ts')
          ) {
            files.push(fullPath);
          }
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
 *
 * Formula: SHA-256(`${type}:${filePath}:${name}`).slice(0, 12)
 *
 * Collision risk is negligible at 12 hex chars (48 bits of hash space) for the expected
 * entity counts of any single repository analysis run.
 */
export function stableEntityId(filePath: string, type: string, name: string): string {
  return createHash('sha256')
    .update(`${type}:${filePath}:${name}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Core extraction entry point. Walks every source file in targetPath and passes
 * each AST node through all four primitive visitors in a single traversal pass.
 *
 * Visitor pattern:
 * - Each visitor receives a no-op `nextId` closure. Returned entities have their IDs
 *   replaced immediately by stableEntityId() before being pushed to the result arrays.
 * - All four visitors are called for every node — null returns are skipped cheaply.
 * - ts.forEachChild recurses the full AST tree depth-first.
 *
 * @param targetPath  Path to a file or directory to analyze.
 * @returns A RepresentationGraph with all four primitive arrays populated.
 */
export function analyzeTarget(
  targetPath: string,
  extractorVersion: string = '1.1.0',
  commitSha?: string,
  excludeWorkspaces: string[] = []
): RepresentationGraph {
  const files = collectFiles(targetPath);

  const nodes: StructuralNode[] = [];
  const edges: StructuralEdge[] = [];
  
  const repoRoot = path.resolve(targetPath);
  const isTargetFile = fs.statSync(repoRoot).isFile();
  const actualRepoRoot = isTargetFile ? path.dirname(repoRoot) : repoRoot;

  // 1. Build Workspace Registry — then apply exclusions
  const rawRegistry = buildWorkspaceRegistry(actualRepoRoot);
  const workspaceRegistry: WorkspaceRegistry = {};
  for (const [pkgName, pkgPath] of Object.entries(rawRegistry)) {
    if (!excludeWorkspaces.includes(pkgName)) {
      workspaceRegistry[pkgName] = pkgPath;
    }
  }

  // 2. Emit WORKSPACE_PACKAGE boundaries (excluded packages are already filtered out)
  for (const [pkgName, pkgPath] of Object.entries(workspaceRegistry)) {
    const relativePkgPath = path.relative(actualRepoRoot, pkgPath) || pkgPath;
    const pkgId = stableEntityId(`package:${pkgName}`, 'BOUNDARY', `Package: ${pkgName}`);
    nodes.push({
      id: pkgId,
      name: `Package: ${pkgName}`,
      type: 'BOUNDARY',
      entityType: 'WORKSPACE_PACKAGE',
      patternId: 'generic.boundary',
      scope: 'USER',
      evidence: { filePath: relativePkgPath }
    });
  }

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    const relativePath = path.relative(actualRepoRoot, filePath) || filePath;
    let scope: 'USER' | 'TEST' | 'MOCK' | 'CONFIG' | 'EXAMPLE' | 'BENCHMARK' = 'USER';
    const lowerPath = relativePath.toLowerCase();
    
    // Improved scope detection matching path segments properly
    const pathSegments = lowerPath.split(/[/\\]/);
    if (pathSegments.includes('test') || pathSegments.includes('tests') || pathSegments.includes('__tests__') || lowerPath.includes('.test.') || lowerPath.includes('.spec.')) {
      scope = 'TEST';
    } else if (pathSegments.includes('mock') || pathSegments.includes('mocks') || pathSegments.includes('__mocks__')) {
      scope = 'MOCK';
    } else if (pathSegments.includes('config') || pathSegments.includes('configs')) {
      scope = 'CONFIG';
    } else if (pathSegments.includes('example') || pathSegments.includes('examples')) {
      scope = 'EXAMPLE';
    } else if (pathSegments.includes('benchmark') || pathSegments.includes('benchmarks')) {
      scope = 'BENCHMARK';
    }

    // Assign parent_boundary_id if file belongs to a workspace package
    let parentBoundaryId: string | undefined = undefined;
    for (const [pkgName, pkgPath] of Object.entries(workspaceRegistry)) {
      if (filePath.startsWith(pkgPath + path.sep) || filePath === pkgPath) {
        parentBoundaryId = stableEntityId(`package:${pkgName}`, 'BOUNDARY', `Package: ${pkgName}`);
        break;
      }
    }

    const fileId = stableEntityId(relativePath, 'BOUNDARY', `File: ${relativePath}`);
    nodes.push({
      id: fileId,
      name: `File: ${relativePath}`,
      type: 'BOUNDARY',
      entityType: 'FILE', patternId: 'generic.boundary',
      scope,
      parentBoundaryId,
      evidence: { filePath: relativePath },
    });

    // Classify the file's Next.js App Router role (if any) once, before the AST walk.
    const fileRole: NextjsFileRole | null = classifyNextjsFile(relativePath);

    /**
     * Constructs a 1-indexed source evidence record for the given AST node.
     * Truncates snippets to 80 characters and normalizes whitespace.
     */
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

    /**
     * Traverses a single AST node through all primitive visitors in order.
     * Replaces placeholder entity IDs with deterministic stableEntityId() before pushing to graph arrays.
     */
    function visit(node: ts.Node) {
      const boundaryResult = visitBoundary(node, sourceFile, getEvidence, () => '', actualRepoRoot, fileRole, relativePath, workspaceRegistry);
      const boundaryEntities = Array.isArray(boundaryResult) ? boundaryResult : (boundaryResult ? [boundaryResult] : []);
      for (const boundaryEntity of boundaryEntities) {
        if (boundaryEntity.entityType === 'EXTERNAL_PACKAGE' || boundaryEntity.entityType === 'NODE_BUILTIN') {
          const importLiteral = boundaryEntity.name.replace('Package: ', '');
          boundaryEntity.id = stableEntityId(`package:${importLiteral}`, boundaryEntity.type, boundaryEntity.name);
        } else {
          boundaryEntity.id = stableEntityId(relativePath, boundaryEntity.type, boundaryEntity.name);
          boundaryEntity.parentBoundaryId = fileId;
        }
        boundaryEntity.scope = scope;
        nodes.push(boundaryEntity as StructuralNode);
      }

      const contractResult = visitContract(node, sourceFile, getEvidence, () => '', fileRole);
      const contractEntities = Array.isArray(contractResult) ? contractResult : (contractResult ? [contractResult] : []);
      for (const contractEntity of contractEntities) {
        contractEntity.id = stableEntityId(relativePath, contractEntity.type, contractEntity.name);
        contractEntity.parentBoundaryId = fileId;
        contractEntity.scope = scope;
        nodes.push(contractEntity as StructuralNode);
      }

      const relationshipResult = visitRelationship(node, sourceFile, getEvidence, () => '', actualRepoRoot, fileId, workspaceRegistry);
      const relationshipEntities = Array.isArray(relationshipResult) ? relationshipResult : (relationshipResult ? [relationshipResult] : []);
      for (const relationshipEntity of relationshipEntities) {
        relationshipEntity.id = stableEntityId(relativePath, relationshipEntity.type, relationshipEntity.name);
        relationshipEntity.scope = scope;
        if (!(relationshipEntity as any).sourceId) (relationshipEntity as any).sourceId = fileId;
        edges.push(relationshipEntity as StructuralEdge);
      }

      const openConnectorResult = visitOpenConnector(node, sourceFile, getEvidence, () => '');
      const openConnectorEntities = Array.isArray(openConnectorResult) ? openConnectorResult : (openConnectorResult ? [openConnectorResult] : []);
      for (const openConnectorEntity of openConnectorEntities) {
        openConnectorEntity.id = stableEntityId(relativePath, openConnectorEntity.type, openConnectorEntity.name);
        openConnectorEntity.parentBoundaryId = fileId;
        openConnectorEntity.scope = scope;
        nodes.push(openConnectorEntity as StructuralNode);

        edges.push({
          id: stableEntityId(relativePath, 'RELATIONSHIP', `Call to ${openConnectorEntity.id}`),
          name: `Call: ${openConnectorEntity.name}`,
          type: 'RELATIONSHIP',
          entityType: 'CALL', patternId: 'generic.relationship',
          sourceId: fileId,
          targetId: openConnectorEntity.id,
          status: 'DETERMINISTIC',
          confidence: 'HIGH',
          evidence: openConnectorEntity.evidence,
          scope: scope
        });
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return {
    extractorVersion,
    analyzedAt: new Date().toISOString(),
    commitSha,
    nodes,
    edges,
  };
}
