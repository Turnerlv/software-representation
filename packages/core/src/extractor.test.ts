import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeTarget, collectFiles } from './extractor/index.js';

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

  // Open connectors use 'HTTP Call:' prefix for allowlisted HTTP clients
  assert.ok(graph.openConnectors.some((oc) => oc.name.startsWith('HTTP Call:') && oc.name.includes('fetch')));

  assert.ok(graph.boundaries[0].evidence.filePath);
  assert.ok(graph.boundaries[0].evidence.lineNumber);
});

test('analyzeTarget does NOT emit false-positive OPEN_CONNECTORs for non-allowlisted calls', () => {
  // Write a temp fixture with patterns that triggered false positives under the old substring-matching logic.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chomp-fp-test-'));
  const tmpFile = path.join(tmpDir, 'false_positives.ts');

  fs.writeFileSync(tmpFile, [
    "import queryString from 'qs';",
    "import { Response } from 'express';",
    '',
    'function handler(res: Response) {',
    '  const params = queryString.parse(res.query);', // 'query' substring — old false positive
    '  const closed = db.close();',                   // 'db.' substring — old false positive
    '  const data = response.json();',                // non-allowlisted 'response' identifier
    '  return params;',
    '}',
  ].join('\n'));

  const graph = analyzeTarget(tmpFile);

  assert.strictEqual(
    graph.openConnectors.length,
    0,
    `Expected 0 open connectors but got ${graph.openConnectors.length}: ` +
    JSON.stringify(graph.openConnectors.map((oc) => oc.name))
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
});


