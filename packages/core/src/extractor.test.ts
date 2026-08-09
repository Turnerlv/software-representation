import assert from 'node:assert';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeTarget, collectFiles } from './extractor.js';

test('collectFiles returns files for directory and single file', () => {
  const sampleDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'sample-app');
  const files = collectFiles(sampleDir);

  assert.ok(files.length >= 2);
  assert.ok(files.some((f) => f.endsWith('userService.ts')));
  assert.ok(files.some((f) => f.endsWith('types.ts')));

  const singleFile = path.join(sampleDir, 'userService.ts');
  const singleCollected = collectFiles(singleFile);
  assert.strictEqual(singleCollected.length, 1);
  assert.strictEqual(singleCollected[0], singleFile);
});

test('analyzeTarget extracts boundaries, contracts, relationships, and open connectors', () => {
  const sampleDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'sample-app');
  const graph = analyzeTarget(sampleDir);

  assert.ok(graph.boundaries.some((b) => b.name === 'Class: UserService'));
  assert.ok(graph.contracts.some((c) => c.name === 'Interface: User'));
  assert.ok(graph.contracts.some((c) => c.name === 'Type: UserCredentials'));
  assert.ok(graph.relationships.some((r) => r.name === 'Import: ./types'));
  assert.ok(graph.openConnectors.some((oc) => oc.name.includes('fetch')));

  assert.ok(graph.boundaries[0].evidence.filePath);
  assert.ok(graph.boundaries[0].evidence.lineNumber);
});
