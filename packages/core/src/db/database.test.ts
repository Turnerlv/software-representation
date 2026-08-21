import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { RepresentationGraph } from '../types/index.js';
import {
  getAllLedgerEntries,
  getLedgerSummary,
  getRepresentationGraph,
  initDatabase,
  logExtractionGap,
  RepositoryInfo,
  resolveExtractionGap,
  saveRepresentationGraph,
} from './index.js';

test('initDatabase defaults to :memory: and creates tables', () => {
  const db = initDatabase();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as Array<{ name: string }>;

  const tableNames = tables.map((t) => t.name);
  assert.ok(tableNames.includes('repositories'));
  assert.ok(tableNames.includes('nodes'));
  assert.ok(tableNames.includes('edges'));
  assert.ok(tableNames.includes('evidence_records'));
  assert.ok(tableNames.includes('extractor_coverage_ledger'));
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
  assert.strictEqual(getRepresentationGraph(db, repo.id), null);

  // Save graph and retrieve
  saveRepresentationGraph(db, repo, graph);
  const retrieved = getRepresentationGraph(db, repo.id);

  assert.deepStrictEqual(retrieved, graph);

  // Upsert/overwrite repository graph
  const updatedGraph: RepresentationGraph = {
    ...graph,
    analyzedAt: '2026-08-09T11:00:00Z',
    nodes: [],
  };

  saveRepresentationGraph(db, repo, updatedGraph);
  const updatedRetrieved = getRepresentationGraph(db, repo.id);
  assert.deepStrictEqual(updatedRetrieved, updatedGraph);

  db.close();
});

test('extractor_coverage_ledger logExtractionGap, resolveExtractionGap, and getLedgerSummary', () => {
  const db = initDatabase();

  const initialSummary = getLedgerSummary(db);
  assert.strictEqual(initialSummary.totalPatterns, 0);
  assert.strictEqual(initialSummary.resolvedCount, 0);
  assert.strictEqual(initialSummary.resolvedPercentage, 0);

  const gap1 = logExtractionGap(db, {
    id: 'gap-express-1',
    patternName: 'Express App Router Mount',
    framework: 'Express',
    impactLevel: 'HIGH',
    evidenceRepo: 'fixtures/cloned-repos/express-sample',
    evidenceFile: 'src/routes/user.ts',
    evidenceLine: 15,
    evidenceSnippet: 'app.use("/user", userRouter);',
  });

  assert.strictEqual(gap1.id, 'gap-express-1');
  assert.strictEqual(gap1.patternName, 'Express App Router Mount');
  assert.strictEqual(gap1.framework, 'Express');
  assert.strictEqual(gap1.status, 'DISCOVERED');
  assert.strictEqual(gap1.impactLevel, 'HIGH');
  assert.strictEqual(gap1.evidenceRepo, 'fixtures/cloned-repos/express-sample');
  assert.strictEqual(gap1.evidenceFile, 'src/routes/user.ts');
  assert.strictEqual(gap1.evidenceLine, 15);
  assert.strictEqual(gap1.evidenceSnippet, 'app.use("/user", userRouter);');

  const gap2 = logExtractionGap(db, {
    pattern_name: 'NextJS Server Action',
    framework: 'Next.js',
    evidence_repo: 'fixtures/cloned-repos/next-sample',
    evidence_file: 'app/actions.ts',
  });

  assert.ok(gap2.id);
  assert.strictEqual(gap2.patternName, 'NextJS Server Action');
  assert.strictEqual(gap2.framework, 'Next.js');
  assert.strictEqual(gap2.status, 'DISCOVERED');
  assert.strictEqual(gap2.impactLevel, 'MEDIUM');

  let summary = getLedgerSummary(db);
  assert.strictEqual(summary.totalPatterns, 2);
  assert.strictEqual(summary.resolvedCount, 0);
  assert.strictEqual(summary.resolvedPercentage, 0);
  assert.strictEqual(summary.byStatus.DISCOVERED, 2);
  assert.strictEqual(summary.byFramework['Express'], 1);
  assert.strictEqual(summary.byFramework['Next.js'], 1);

  const resolvedGap = resolveExtractionGap(db, 'gap-express-1', {
    fixLocation: 'packages/core/src/extractors/express.ts:45',
    fixPatternSummary: 'Added visitor for app.use router mounting',
    testFixturePath: 'fixtures/unit/express.test.ts',
  });

  assert.ok(resolvedGap);
  assert.strictEqual(resolvedGap?.status, 'RESOLVED');
  assert.strictEqual(
    resolvedGap?.fixLocation,
    'packages/core/src/extractors/express.ts:45'
  );
  assert.strictEqual(
    resolvedGap?.fixPatternSummary,
    'Added visitor for app.use router mounting'
  );
  assert.strictEqual(
    resolvedGap?.testFixturePath,
    'fixtures/unit/express.test.ts'
  );

  summary = getLedgerSummary(db);
  assert.strictEqual(summary.totalPatterns, 2);
  assert.strictEqual(summary.resolvedCount, 1);
  assert.strictEqual(summary.resolvedPercentage, 50);
  assert.strictEqual(summary.byStatus.RESOLVED, 1);
  assert.strictEqual(summary.byStatus.DISCOVERED, 1);

  const entries = getAllLedgerEntries(db);
  assert.strictEqual(entries.length, 2);

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

