import fs from 'fs';
import path from 'path';
import { analyzeTarget } from './src/extractor/index.js';

const fixturesDir = path.join(process.cwd(), '../../fixtures', 'test-repos');
const fixtures = fs.readdirSync(fixturesDir).filter(f => fs.statSync(path.join(fixturesDir, f)).isDirectory());

for (const fixture of fixtures) {
  const fixturePath = path.join(fixturesDir, fixture);
  const expectedPath = path.join(fixturePath, 'expected.json');
  
  try {
    const actual = analyzeTarget(fixturePath);
    const actualMapped = {
      boundaries: actual.boundaries.map(b => ({ name: b.name, entityType: b.entityType })),
      contracts: actual.contracts.map(c => ({ name: c.name, entityType: c.entityType })),
      relationships: actual.relationships.map(r => ({ name: r.name, entityType: r.entityType })),
      openConnectors: actual.openConnectors.map(oc => ({ name: oc.name, entityType: oc.entityType }))
    };
    
    fs.writeFileSync(expectedPath, JSON.stringify(actualMapped, null, 2));
    console.log(`Updated ${fixture}/expected.json`);
  } catch (err) {
    console.error(`Failed to update ${fixture}:`, err.message);
  }
}
