import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareGraphs } from './index.js';
import { RepresentationGraph } from '../types/ontology.js';

describe('compareGraphs', () => {
  const baseGraph: RepresentationGraph = {
    extractorVersion: '1.0.0',
    analyzedAt: '2026-09-06',
    nodes: [
      { id: '1', name: 'App', type: 'BOUNDARY', entityType: 'CLASS', patternId: 'cls', evidence: [] },
      { id: '2', name: 'removedNode', type: 'CONTRACT', entityType: 'FN', patternId: 'fn', evidence: [] },
      { id: '3', name: 'modifiedNode', type: 'CONTRACT', entityType: 'FN', patternId: 'fn', evidence: [{ filePath: 'file.ts', lineNumber: 1 }] },
    ],
    edges: [
      { id: 'e1', name: 'call', type: 'RELATIONSHIP', entityType: 'CALL', patternId: 'call', sourceId: '1', targetId: '2', evidence: [] },
    ]
  };

  const currentGraph: RepresentationGraph = {
    extractorVersion: '1.0.0',
    analyzedAt: '2026-09-06',
    nodes: [
      { id: '1', name: 'App', type: 'BOUNDARY', entityType: 'CLASS', patternId: 'cls', evidence: [] }, // Unchanged
      { id: '3', name: 'modifiedNode', type: 'CONTRACT', entityType: 'FN', patternId: 'fn', evidence: [{ filePath: 'file.ts', lineNumber: 5 }] }, // Modified (line changed)
      { id: '4', name: 'addedNode', type: 'CONTRACT', entityType: 'FN', patternId: 'fn', evidence: [] }, // Added
    ],
    edges: [
      { id: 'e2', name: 'call', type: 'RELATIONSHIP', entityType: 'CALL', patternId: 'call', sourceId: '1', targetId: '3', evidence: [] }, // Added edge
    ]
  };

  it('should identify UNCHANGED, REMOVED, MODIFIED, and ADDED nodes', () => {
    const diff = compareGraphs(baseGraph, currentGraph);

    assert.equal(diff.nodes['1']?.status, 'UNCHANGED');
    assert.equal(diff.nodes['2']?.status, 'REMOVED');
    assert.equal(diff.nodes['3']?.status, 'LEXICAL_SHIFT'); // line number drifting triggers LEXICAL_SHIFT
    assert.equal(diff.nodes['4']?.status, 'ADDED');
    
    // Check that base and target are correctly assigned
    assert.equal(diff.nodes['2'].base?.name, 'removedNode');
    assert.equal(diff.nodes['4'].target?.name, 'addedNode');
  });

  it('should identify UNCHANGED, REMOVED, MODIFIED, and ADDED edges', () => {
    const diff = compareGraphs(baseGraph, currentGraph);
    
    assert.equal(diff.edges['e1']?.status, 'REMOVED');
    assert.equal(diff.edges['e2']?.status, 'ADDED');
  });
});
