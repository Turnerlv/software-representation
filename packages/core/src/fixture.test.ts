import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { analyzeTarget } from './extractor/index.js';

test('analyzeTarget exactly matches expected.json for all fixtures', () => {
  const fixturesDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos');
  const fixtures = fs.readdirSync(fixturesDir).filter(f => fs.statSync(path.join(fixturesDir, f)).isDirectory());

  for (const fixture of fixtures) {
    const fixturePath = path.join(fixturesDir, fixture);
    const expectedPath = path.join(fixturePath, 'expected.json');
    if (!fs.existsSync(expectedPath)) {
      continue;
    }

    const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    const actual = analyzeTarget(fixturePath);

    const actualMapped = {
      boundaries: actual.nodes.filter(n => n.type === 'BOUNDARY').map(b => ({ name: b.name, entityType: b.entityType, patternId: b.patternId })),
      contracts: actual.nodes.filter(n => n.type === 'CONTRACT').map(c => ({ name: c.name, entityType: c.entityType, patternId: c.patternId })),
      relationships: actual.edges.map(r => ({ name: r.name, entityType: r.entityType, patternId: r.patternId })),
      openConnectors: actual.nodes.filter(n => n.type === 'OPEN_CONNECTOR').map(oc => ({ name: oc.name, entityType: oc.entityType, patternId: oc.patternId }))
    };

    // Sort to ensure order independence in assertions
    const sortFn = (a: any, b: any) => a.name.localeCompare(b.name);
    
    expected.boundaries.sort(sortFn);
    actualMapped.boundaries.sort(sortFn);
    assert.deepEqual(actualMapped.boundaries, expected.boundaries, `Fixture ${fixture} boundaries mismatch`);

    expected.contracts.sort(sortFn);
    actualMapped.contracts.sort(sortFn);
    assert.deepEqual(actualMapped.contracts, expected.contracts, `Fixture ${fixture} contracts mismatch`);

    expected.relationships.sort(sortFn);
    actualMapped.relationships.sort(sortFn);
    assert.deepEqual(actualMapped.relationships, expected.relationships, `Fixture ${fixture} relationships mismatch`);

    expected.openConnectors.sort(sortFn);
    actualMapped.openConnectors.sort(sortFn);
    assert.deepEqual(actualMapped.openConnectors, expected.openConnectors, `Fixture ${fixture} openConnectors mismatch`);
  }
});
