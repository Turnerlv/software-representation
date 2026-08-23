import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { analyzeTarget } from './extractor/index.js';

test('Extracted entities must have patternIds that exist in the ledger as handled', () => {
  const dbPath = path.join(process.cwd(), '..', '..', 'fixtures', 'research', 'pattern_ledger.db');
  
  if (!fs.existsSync(dbPath)) {
    // Skip if DB doesn't exist (e.g. in some pure unit test environments without fixtures)
    return;
  }

  // Use system sqlite3 to extract handled patterns
  const cmd = `sqlite3 ${dbPath} "SELECT pattern_id FROM pattern_ledger WHERE status = 'handled';"`;
  const output = execSync(cmd, { encoding: 'utf8' });
  const handledPatterns = new Set(output.split('\n').map(s => s.trim()).filter(Boolean));

  assert.ok(handledPatterns.size > 0, 'Should have loaded handled patterns from DB');

  const fixturesDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos');
  const fixtures = fs.readdirSync(fixturesDir).filter(f => fs.statSync(path.join(fixturesDir, f)).isDirectory());

  for (const fixture of fixtures) {
    const fixturePath = path.join(fixturesDir, fixture);
    const expectedPath = path.join(fixturePath, 'expected.json');
    if (!fs.existsSync(expectedPath)) {
      continue;
    }

    const actual = analyzeTarget(fixturePath);
    const allEntities = [...actual.nodes, ...actual.edges];

    for (const entity of allEntities) {
      assert.ok(entity.patternId, `Entity ${entity.name} in fixture ${fixture} is missing a patternId`);
      assert.ok(
        handledPatterns.has(entity.patternId),
        `Entity ${entity.name} in fixture ${fixture} has patternId '${entity.patternId}' which is not 'handled' in the ledger`
      );
    }
  }
});
