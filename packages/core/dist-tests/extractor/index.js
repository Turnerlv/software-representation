// packages/core/src/extractor/index.ts
// Extraction orchestrator — walks source files, dispatches to visitors, and assembles the RepresentationGraph.
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { visitBoundary } from './visitors/boundaryVisitor.js';
import { visitContract } from './visitors/contractVisitor.js';
import { visitRelationship } from './visitors/relationshipVisitor.js';
import { visitOpenConnector } from './visitors/openConnectorVisitor.js';
/**
 * Recursively collects all TypeScript and JavaScript source files under the given path.
 *
 * Skips node_modules, .git, dist, and build directories automatically.
 * If targetPath points to a single file, that file is returned directly.
 *
 * @param targetPath  Absolute or relative path to a file or directory.
 * @returns Sorted list of absolute file paths to analyze.
 */
export function collectFiles(targetPath) {
    const absolutePath = path.resolve(targetPath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Target path does not exist: ${targetPath}`);
    }
    const stat = fs.statSync(absolutePath);
    if (stat.isFile()) {
        return [absolutePath];
    }
    const files = [];
    function walkDir(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' ||
                    entry.name === '.git' ||
                    entry.name === 'dist' ||
                    entry.name === 'build') {
                    continue;
                }
                walkDir(fullPath);
            }
            else if (entry.isFile()) {
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
 *
 * Formula: SHA-256(`${type}:${filePath}:${name}`).slice(0, 12)
 *
 * Collision risk is negligible at 12 hex chars (48 bits of hash space) for the expected
 * entity counts of any single repository analysis run.
 */
export function stableEntityId(filePath, type, name) {
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
export function analyzeTarget(targetPath, extractorVersion = '1.0.0', commitSha) {
    const files = collectFiles(targetPath);
    const boundaries = [];
    const contracts = [];
    const relationships = [];
    const openConnectors = [];
    const repoRoot = path.resolve(targetPath);
    const isTargetFile = fs.statSync(repoRoot).isFile();
    const actualRepoRoot = isTargetFile ? path.dirname(repoRoot) : repoRoot;
    for (const filePath of files) {
        const sourceText = fs.readFileSync(filePath, 'utf8');
        const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
        const relativePath = path.relative(process.cwd(), filePath) || filePath;
        /**
         * Constructs a 1-indexed source evidence record for the given AST node.
         * Truncates snippets to 80 characters and normalizes whitespace.
         */
        function getEvidence(node) {
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
        function visit(node) {
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
            // We use the file itself as the boundary for relationships if not inside a class
            const sourceId = stableEntityId(relativePath, 'BOUNDARY', `File: ${relativePath}`);
            const relationshipEntity = visitRelationship(node, sourceFile, getEvidence, () => '', actualRepoRoot, sourceId);
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
        version: extractorVersion,
        analyzedAt: new Date().toISOString(),
        commitSha,
        boundaries,
        contracts,
        relationships,
        openConnectors,
    };
}
