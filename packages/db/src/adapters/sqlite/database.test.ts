import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { RepresentationGraph } from '@chomp/core';
import { createSQLiteStorage } from './index.js';
import { RepositoryInfo } from '../../interface.js';

test('createSQLiteStorage defaults to :memory: and creates tables', async () => {
  const storage = createSQLiteStorage(':memory:');
  const repos = await storage.listRepositories();
  assert.deepStrictEqual(repos, []);
  await storage.close();
});

test('saveRepresentationGraph and getRepresentationGraph with repository info', async () => {
  const storage = createSQLiteStorage(':memory:');

  const repo: RepositoryInfo = {
    id: 'repo-123',
    name: 'chomp-core',
    path: '/path/to/chomp-core',
  };

  const graph: RepresentationGraph = {
    extractorVersion: '1.0.0',
    analyzedAt: '2026-08-09T10:00:00Z',
    nodes: [
      {
        id: 'b1',
        name: 'AuthService',
        type: 'BOUNDARY',
        entityType: 'CLASS',
        scope: 'USER',
        evidence: {
          filePath: 'src/auth/service.ts',
          lineNumber: 12,
          snippet: 'class AuthService {}',
        },
      },
      {
        id: 'c1',
        name: 'POST /api/login',
        type: 'CONTRACT',
        entityType: 'HTTP_ENDPOINT',
        scope: 'USER',
        evidence: {
          filePath: 'src/auth/router.ts',
          lineNumber: 45,
          snippet: "router.post('/login', handler)",
        },
      },
      {
        id: 'oc1',
        name: 'StripePaymentGateway',
        type: 'OPEN_CONNECTOR',
        entityType: 'HTTP_FETCH',
        scope: 'USER',
        evidence: {
          filePath: 'src/payment/stripe.ts',
          lineNumber: 3,
        },
      },
    ],
    edges: [
      {
        id: 'r1',
        name: 'AuthService -> Database',
        type: 'RELATIONSHIP',
        entityType: 'IMPORT',
        scope: 'USER',
        sourceId: 'b1',
        evidence: {
          filePath: 'src/auth/service.ts',
          lineNumber: 8,
          snippet: 'import { db } from "../db";',
        },
      },
    ],
  };

  // Initially returns null for unknown repository
  assert.strictEqual(await storage.getRepresentationGraph(repo.id), null);

  // Save graph and retrieve
  await storage.saveRepresentationGraph(repo, graph);
  const retrieved = await storage.getRepresentationGraph(repo.id);

  assert.deepStrictEqual(retrieved, graph);

  // listRepositories
  const repos = await storage.listRepositories();
  assert.strictEqual(repos.length, 1);
  assert.strictEqual(repos[0].id, 'repo-123');
  assert.strictEqual(repos[0].name, 'chomp-core');

  // Upsert/overwrite repository graph
  const updatedGraph: RepresentationGraph = {
    ...graph,
    analyzedAt: '2026-08-09T11:00:00Z',
    nodes: [],
  };

  await storage.saveRepresentationGraph(repo, updatedGraph);
  const updatedRetrieved = await storage.getRepresentationGraph(repo.id);
  assert.deepStrictEqual(updatedRetrieved, updatedGraph);

  // deleteRepository
  await storage.deleteRepository(repo.id);
  const nullAfterDelete = await storage.getRepresentationGraph(repo.id);
  assert.strictEqual(nullAfterDelete, null);

  await storage.close();
});

test('createSQLiteStorage creates directory for file-backed database', async () => {
  const testDbDir = path.join(process.cwd(), 'temp_test_data_spec');
  const testDbPath = path.join(testDbDir, 'graph.db');

  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true });
  }

  const storage = createSQLiteStorage(testDbPath);
  assert.ok(fs.existsSync(testDbPath));

  await storage.close();
  fs.rmSync(testDbDir, { recursive: true, force: true });
});
