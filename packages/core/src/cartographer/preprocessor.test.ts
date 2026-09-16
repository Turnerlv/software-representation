import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { condenseGraph } from './preprocessor.js';
import type { RepresentationGraph, StructuralNode, StructuralEdge } from '../types/ontology.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(
  id: string,
  type: StructuralNode['type'],
  entityType: string,
  parentBoundaryId?: string,
): StructuralNode {
  return {
    id,
    name: id,
    type,
    entityType,
    patternId: 'test',
    scope: 'USER',
    evidence: { filePath: 'test' },
    ...(parentBoundaryId ? { parentBoundaryId } : {}),
  };
}

function makeEdge(sourceId: string, targetId: string): StructuralEdge {
  return {
    id: `e_${sourceId}_${targetId}`,
    name: `${sourceId} -> ${targetId}`,
    type: 'RELATIONSHIP',
    entityType: 'IMPORT',
    patternId: 'test',
    evidence: { filePath: 'test' },
    sourceId,
    targetId,
  };
}

function makeGraph(nodes: StructuralNode[], edges: StructuralEdge[]): RepresentationGraph {
  return { nodes, edges, extractorVersion: '0', analyzedAt: '' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('condenseGraph', () => {

  it('emits only WORKSPACE_PACKAGE and EXTERNAL_PACKAGE nodes', () => {
    const nodes = [
      makeNode('pkg-cli', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('pkg-core', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('file-cli-ui', 'BOUNDARY', 'FILE', 'pkg-cli'),
      makeNode('fn-condenseGraph', 'CONTRACT', 'FUNCTION', 'file-cli-ui'),
    ];
    const { nodes: out } = condenseGraph(makeGraph(nodes, []));
    const ids = out.map(n => n.id);
    assert.ok(ids.includes('pkg-cli'), 'should include pkg-cli');
    assert.ok(ids.includes('pkg-core'), 'should include pkg-core');
    assert.ok(!ids.includes('file-cli-ui'), 'should exclude file boundary');
    assert.ok(!ids.includes('fn-condenseGraph'), 'should exclude contract node');
    assert.equal(out.length, 2);
  });

  it('rolls contract->file->package edges up to the package level', () => {
    const nodes = [
      makeNode('pkg-cli', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('pkg-core', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('file-ui-ts', 'BOUNDARY', 'FILE', 'pkg-cli'),
      makeNode('file-preprocessor-ts', 'BOUNDARY', 'FILE', 'pkg-core'),
      makeNode('fn-condenseGraph', 'CONTRACT', 'FUNCTION', 'file-preprocessor-ts'),
    ];
    const edges = [makeEdge('file-ui-ts', 'fn-condenseGraph')];
    const { edges: out } = condenseGraph(makeGraph(nodes, edges));
    assert.equal(out.length, 1);
    assert.equal(out[0].sourceId, 'pkg-cli');
    assert.equal(out[0].targetId, 'pkg-core');
  });

  it('deduplicates multiple fine-grained edges that roll up to the same package pair', () => {
    const nodes = [
      makeNode('pkg-cli', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('pkg-core', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('file-analyze', 'BOUNDARY', 'FILE', 'pkg-cli'),
      makeNode('file-ui', 'BOUNDARY', 'FILE', 'pkg-cli'),
      makeNode('file-health', 'BOUNDARY', 'FILE', 'pkg-cli'),
      makeNode('file-extractor', 'BOUNDARY', 'FILE', 'pkg-core'),
    ];
    const edges = [
      makeEdge('file-analyze', 'file-extractor'),
      makeEdge('file-ui', 'file-extractor'),
      makeEdge('file-health', 'file-extractor'),
    ];
    const { edges: out } = condenseGraph(makeGraph(nodes, edges));
    assert.equal(out.length, 1, 'three fine-grained edges should deduplicate to one');
    assert.equal(out[0].sourceId, 'pkg-cli');
    assert.equal(out[0].targetId, 'pkg-core');
  });

  it('drops self-loops produced by rollup (two files in the same package)', () => {
    const nodes = [
      makeNode('pkg-core', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('file-extractor', 'BOUNDARY', 'FILE', 'pkg-core'),
      makeNode('file-visitors', 'BOUNDARY', 'FILE', 'pkg-core'),
    ];
    const edges = [makeEdge('file-extractor', 'file-visitors')];
    const { edges: out } = condenseGraph(makeGraph(nodes, edges));
    assert.equal(out.length, 0, 'intra-package edges should be dropped');
  });

  it('drops NODE_BUILTIN edges entirely (no macro ancestor)', () => {
    const nodes = [
      makeNode('pkg-cli', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('file-analyze', 'BOUNDARY', 'FILE', 'pkg-cli'),
      makeNode('node-fs', 'BOUNDARY', 'NODE_BUILTIN'),
    ];
    const edges = [makeEdge('file-analyze', 'node-fs')];
    const { edges: out } = condenseGraph(makeGraph(nodes, edges));
    assert.equal(out.length, 0, 'NODE_BUILTIN has no macro ancestor, edge should be dropped');
  });

  it('drops EXTERNAL_PACKAGE at L1 when only 1 workspace package depends on it', () => {
    // ext-react is used by only @chomp/web → should be excluded from L1
    const nodes = [
      makeNode('pkg-web', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('pkg-cli', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('file-page', 'BOUNDARY', 'FILE', 'pkg-web'),
      makeNode('ext-react', 'BOUNDARY', 'EXTERNAL_PACKAGE'),
    ];
    const edges = [makeEdge('file-page', 'ext-react')];
    const { nodes: outNodes, edges: outEdges } = condenseGraph(makeGraph(nodes, edges));
    assert.ok(!outNodes.map(n => n.id).includes('ext-react'), 'single-dependent EXTERNAL_PACKAGE should be dropped at L1');
    assert.equal(outEdges.length, 0, 'edge to dropped external package should also be dropped');
  });

  it('keeps EXTERNAL_PACKAGE at L1 when ≥2 workspace packages depend on it', () => {
    // better-sqlite3 used by both @chomp/core and @chomp/db → should appear at L1
    const nodes = [
      makeNode('pkg-core', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('pkg-db', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('file-extractor', 'BOUNDARY', 'FILE', 'pkg-core'),
      makeNode('file-schema', 'BOUNDARY', 'FILE', 'pkg-db'),
      makeNode('ext-sqlite3', 'BOUNDARY', 'EXTERNAL_PACKAGE'),
    ];
    const edges = [
      makeEdge('file-extractor', 'ext-sqlite3'),
      makeEdge('file-schema', 'ext-sqlite3'),
    ];
    const { nodes: outNodes, edges: outEdges } = condenseGraph(makeGraph(nodes, edges));
    assert.ok(outNodes.map(n => n.id).includes('ext-sqlite3'), 'multi-dependent EXTERNAL_PACKAGE should survive at L1');
    const edgePairs = outEdges.map(e => `${e.sourceId}:${e.targetId}`).sort();
    assert.deepEqual(edgePairs, ['pkg-core:ext-sqlite3', 'pkg-db:ext-sqlite3'].sort());
  });


  it('handles multi-hop parentBoundaryId chains (contract -> file -> package)', () => {
    const nodes = [
      makeNode('pkg-mcp', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('pkg-db', 'BOUNDARY', 'WORKSPACE_PACKAGE'),
      makeNode('file-mcp-index', 'BOUNDARY', 'FILE', 'pkg-mcp'),
      makeNode('file-db-index', 'BOUNDARY', 'FILE', 'pkg-db'),
      makeNode('fn-createStorage', 'CONTRACT', 'FUNCTION', 'file-db-index'),
    ];
    const edges = [makeEdge('file-mcp-index', 'fn-createStorage')];
    const { edges: out } = condenseGraph(makeGraph(nodes, edges));
    assert.equal(out.length, 1);
    assert.equal(out[0].sourceId, 'pkg-mcp');
    assert.equal(out[0].targetId, 'pkg-db');
  });

  it('returns an empty graph when given no nodes', () => {
    const { nodes, edges } = condenseGraph(makeGraph([], []));
    assert.equal(nodes.length, 0);
    assert.equal(edges.length, 0);
  });

  it('produces the expected 5-package topology for a chomp monorepo fixture', () => {
    const packages = ['cli', 'core', 'db', 'mcp', 'web'].map(p =>
      makeNode(`pkg-${p}`, 'BOUNDARY', 'WORKSPACE_PACKAGE'),
    );
    const files = [
      makeNode('f-analyze', 'BOUNDARY', 'FILE', 'pkg-cli'),
      makeNode('f-extractor', 'BOUNDARY', 'FILE', 'pkg-core'),
      makeNode('f-schema', 'BOUNDARY', 'FILE', 'pkg-db'),
      makeNode('f-mcp-index', 'BOUNDARY', 'FILE', 'pkg-mcp'),
      makeNode('f-page', 'BOUNDARY', 'FILE', 'pkg-web'),
    ];
    const contracts = [
      makeNode('fn-extract', 'CONTRACT', 'FUNCTION', 'f-extractor'),
      makeNode('fn-storage', 'CONTRACT', 'FUNCTION', 'f-schema'),
    ];
    const rawEdges = [
      makeEdge('f-analyze', 'fn-extract'),   // cli -> core
      makeEdge('f-analyze', 'fn-storage'),   // cli -> db
      makeEdge('f-schema', 'fn-extract'),    // db  -> core
      makeEdge('f-mcp-index', 'fn-storage'), // mcp -> db
      makeEdge('f-page', 'fn-storage'),      // web -> db
    ];
    const { nodes: outNodes, edges: outEdges } = condenseGraph(
      makeGraph([...packages, ...files, ...contracts], rawEdges),
    );
    assert.equal(outNodes.length, 5, 'should have exactly 5 package nodes');
    const edgePairs = outEdges.map(e => `${e.sourceId}:${e.targetId}`).sort();
    assert.deepEqual(edgePairs, [
      'pkg-cli:pkg-core',
      'pkg-cli:pkg-db',
      'pkg-db:pkg-core',
      'pkg-mcp:pkg-db',
      'pkg-web:pkg-db',
    ].sort());
  });

});
