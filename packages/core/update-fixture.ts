import fs from 'fs';
import path from 'path';
import { analyzeTarget } from './src/extractor/index.js';

const fixture = 'express-app';
const fixturesDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos');
const fixturePath = path.join(fixturesDir, fixture);
const expectedPath = path.join(fixturePath, 'expected.json');

const actual = analyzeTarget(fixturePath);
const actualMapped = {
  boundaries: actual.boundaries.map(b => ({ name: b.name, entityType: b.entityType })),
  contracts: actual.contracts.map(c => ({ name: c.name, entityType: c.entityType })),
  relationships: actual.relationships.map(r => ({ name: r.name, entityType: r.entityType })),
  openConnectors: actual.openConnectors.map(oc => ({ name: oc.name, entityType: oc.entityType }))
};

const sortFn = (a, b) => a.name.localeCompare(b.name);
actualMapped.boundaries.sort(sortFn);
actualMapped.contracts.sort(sortFn);
actualMapped.relationships.sort(sortFn);
actualMapped.openConnectors.sort(sortFn);

fs.writeFileSync(expectedPath, JSON.stringify(actualMapped, null, 2));
console.log('Updated', expectedPath);
