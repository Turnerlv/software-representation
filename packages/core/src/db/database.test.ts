import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { RepresentationGraph } from '../types.js';
import {
  getRepresentationGraph,
  initDatabase,
  RepositoryInfo,
  saveRepresentationGraph,
} from './index.js';

test('initDatabase defaults to :memory: and creates tables', () => {
  const db = initDatabase();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;

  const tableNames = tables.map((t) => t.name);
  assert.ok(tableNames.includes('repositories'));
  assert.ok(tableNames.includes('structural_entities'));
  assert.ok(tableNames.includes('evidence_records'));
  db.close();
});

test('saveRepresentationGraph and getRepresentationGraph with repository info', () => {
  const db = initDatabase();

  const repo: RepositoryInfo = {
    id: 'repo-123',
    name: 'chomp-core',
    path: '/path/to/chomp-core',
  };

  const graph: RepresentationGraph = {
    version: '1.0.0',
    analyzedAt: '2026-08-09T10:00:00Z',
    boundaries: [
      {
        id: 'b1',
        name: 'AuthService',
        type: 'BOUNDARY',
        evidence: {
          filePath: 'src/auth/service.ts',
          lineNumber: 12,
          snippet: 'class AuthService {}',
        },
      },
    ],
    contracts: [
      {
        id: 'c1',
        name: 'POST /api/login',
        type: 'CONTRACT',
        evidence: {
          filePath: 'src/auth/router.ts',
          lineNumber: 45,
          snippet: "router.post('/login', handler)",
        },
      },
    ],
    relationships: [
      {
        id: 'r1',
        name: 'AuthService -> Database',
        type: 'RELATIONSHIP',
        evidence: {
          filePath: 'src/auth/service.ts',
          lineNumber: 8,
          snippet: 'import { db } from "../db";',
        },
      },
    ],
    openConnectors: [
      {
        id: 'oc1',
        name: 'StripePaymentGateway',
        type: 'OPEN_CONNECTOR',
        evidence: {
          filePath: 'src/payment/stripe.ts',
          lineNumber: 3,
        },
      },
    ],
  };

  // Initially returns null for unknown repository
  assert.strictEqual(getRepresentationGraph(db, repo.id), null);

  // Save graph and retrieve
  saveRepresentationGraph(db, repo, graph);
  const retrieved = getRepresentationGraph(db, repo.id);

  assert.deepStrictEqual(retrieved, graph);

  // Upsert/overwrite repository graph
  const updatedGraph: RepresentationGraph = {
    ...graph,
    analyzedAt: '2026-08-09T11:00:00Z',
    boundaries: [],
  };

  saveRepresentationGraph(db, repo, updatedGraph);
  const updatedRetrieved = getRepresentationGraph(db, repo.id);
  assert.deepStrictEqual(updatedRetrieved, updatedGraph);

  db.close();
});

test('initDatabase creates directory for file-backed database', () => {
  const testDbDir = path.join(process.cwd(), 'temp_test_data_spec');
  const testDbPath = path.join(testDbDir, 'chomp.db');

  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  }

  const db = initDatabase(testDbPath);
  assert.ok(fs.existsSync(testDbPath));

  db.close();
  fs.rmSync(testDbDir, { recursive: true, force: true });
});
