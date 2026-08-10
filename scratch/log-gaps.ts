import Database from 'better-sqlite3';
import { logExtractionGap } from './packages/core/src/db/ledgerRepository.js';

const db = new Database('./fixtures/cloned-repos/express.db');

logExtractionGap(db, {
  patternName: 'Express Route Definition',
  framework: 'Express',
  impactLevel: 'HIGH',
  evidenceRepo: 'fixtures/cloned-repos/express',
  evidenceFile: 'examples/hello-world/index.js',
  evidenceLine: 7,
  evidenceSnippet: "app.get('/', function(req, res){",
});

logExtractionGap(db, {
  patternName: 'Express Router Mount',
  framework: 'Express',
  impactLevel: 'HIGH',
  evidenceRepo: 'fixtures/cloned-repos/express',
  evidenceFile: 'examples/multi-router/index.js',
  evidenceLine: 7,
  evidenceSnippet: "app.use('/api/v1', require('./controllers/api_v1'));",
});

logExtractionGap(db, {
  patternName: 'CommonJS Require',
  framework: 'Node.js',
  impactLevel: 'MEDIUM',
  evidenceRepo: 'fixtures/cloned-repos/express',
  evidenceFile: 'examples/hello-world/index.js',
  evidenceLine: 3,
  evidenceSnippet: "var express = require('../../');",
});

console.log('Logged gaps!');
