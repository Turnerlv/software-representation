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

    assert.equal(diff.nodes.find(n => n.id === '1')?.diffStatus, 'UNCHANGED');
    assert.equal(diff.nodes.find(n => n.id === '2')?.diffStatus, 'REMOVED');
    assert.equal(diff.nodes.find(n => n.id === '3')?.diffStatus, 'MODIFIED');
    assert.equal(diff.nodes.find(n => n.id === '4')?.diffStatus, 'ADDED');
  });

  it('should identify UNCHANGED, REMOVED, MODIFIED, and ADDED edges', () => {
    const diff = compareGraphs(baseGraph, currentGraph);
    
    assert.equal(diff.edges.find(e => e.id === 'e1')?.diffStatus, 'REMOVED');
    assert.equal(diff.edges.find(e => e.id === 'e2')?.diffStatus, 'ADDED');
  });
});
