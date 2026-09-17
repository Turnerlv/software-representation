/**
 * @file extractor.test.ts
 * Suite of automated unit tests validating AST node parsing, file collection,
 * primitive extraction (BOUNDARY, CONTRACT, RELATIONSHIP, OPEN_CONNECTOR), CommonJS/ESM
 * handling, Express adapter rules, EventEmitter detection, and 3-tier inferred method calls.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeTarget, collectFiles, stableEntityId } from './extractor/index.js';

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

  assert.ok(graph.nodes.some((b) => b.name === 'Class: UserService' && b.entityType === 'CLASS'));
  assert.ok(graph.nodes.some((c) => c.name === 'Interface: User' && c.entityType === 'EXPORTED_TYPE'));
  assert.ok(graph.nodes.some((c) => c.name === 'Type: UserCredentials' && c.entityType === 'EXPORTED_TYPE'));
  assert.ok(graph.edges.some((r) => r.name === 'Import: ./types' && r.entityType === 'IMPORT'));

  // Open connectors use 'HTTP Call:' prefix for allowlisted HTTP clients
  assert.ok(graph.nodes.some((oc) => oc.type === 'OPEN_CONNECTOR' && oc.name.startsWith('HTTP Call:') && oc.name.includes('fetch') && oc.entityType === 'HTTP_FETCH'));

  const classBoundary = graph.nodes.find(b => b.name === 'Class: UserService');
  assert.ok(classBoundary);
  const evidence = Array.isArray(classBoundary.evidence) ? classBoundary.evidence[0] : classBoundary.evidence;
  assert.ok(evidence.filePath);
  assert.ok(evidence.lineNumber);
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

  const openConnectors = graph.nodes.filter(n => n.type === 'OPEN_CONNECTOR');

  assert.strictEqual(
    openConnectors.length,
    0,
    `Expected 0 open connectors but got ${openConnectors.length}: ` +
    JSON.stringify(openConnectors.map((oc) => oc.name))
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('analyzeTarget extracts Express Route Definition as CONTRACT', () => {
  const fixtureDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'express-app');
  const graph = analyzeTarget(fixtureDir);

  assert.ok(
    graph.nodes.some((c) => c.name === 'Express Route: GET /' && c.entityType === 'HTTP_ENDPOINT'),
    'Expected to extract Express GET / route as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Express Route: POST /login' && c.entityType === 'HTTP_ENDPOINT'),
    'Expected to extract Express POST /login route as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Express Route: GET /items' && c.entityType === 'HTTP_ENDPOINT'),
    'Expected to extract Express GET /items route from router as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Express Param: user' && c.entityType === 'HTTP_ENDPOINT'),
    'Expected to extract Express Param: user as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Express Content Negotiation: application/json, default' && c.entityType === 'HTTP_ENDPOINT'),
    'Expected to extract Express Content Negotiation: application/json, default as CONTRACT'
  );
  assert.ok(
    !graph.nodes.some((c) => c.name === 'Express Route: GET Range'),
    'Expected NOT to extract req.get("Range") as an Express Route'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Property Getter: ip' && c.entityType === 'PROPERTY_GETTER'),
    'Expected to extract defineGetter ip as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Prototype Method: View.prototype.lookup' && c.entityType === 'PROTOTYPE_METHOD'),
    'Expected to extract View.prototype.lookup as CONTRACT'
  );
});

test('analyzeTarget extracts Express Response Connectors', () => {
  const fixtureDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'express-app');
  const graph = analyzeTarget(fixtureDir);

  assert.ok(
    graph.nodes.some((c) => c.name === 'Express File Response: download' && c.entityType === 'FILE_RESPONSE'),
    'Expected to extract Express File Response: download as OPEN_CONNECTOR'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Express View Render' && c.entityType === 'VIEW_RENDER'),
    'Expected to extract Express View Render as OPEN_CONNECTOR'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Express Redirect' && c.entityType === 'REDIRECT'),
    'Expected to extract Express Redirect as OPEN_CONNECTOR'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Express HTTP Response: send' && c.entityType === 'HTTP_RESPONSE'),
    'Expected to extract Express HTTP Response: send as OPEN_CONNECTOR'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Express HTTP Response: json' && c.entityType === 'HTTP_RESPONSE'),
    'Expected to extract Express HTTP Response: json as OPEN_CONNECTOR'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Express HTTP Response: sendStatus' && c.entityType === 'HTTP_RESPONSE'),
    'Expected to extract Express HTTP Response: sendStatus as OPEN_CONNECTOR'
  );
});

test('analyzeTarget extracts Express Router Mount as RELATIONSHIP', () => {
  const fixtureFile = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'express-app', 'app.js');
  const graph = analyzeTarget(fixtureFile);

  assert.ok(
    graph.edges.some((r) => r.name === 'Express Mount: /api -> apiRouter' && r.entityType === 'MOUNTS'),
    'Expected to extract Express /api mount as RELATIONSHIP'
  );
  assert.ok(
    graph.edges.some((r) => r.name === 'Express Mount: /users -> usersRouter' && r.entityType === 'MOUNTS'),
    'Expected to extract Express /users mount as RELATIONSHIP'
  );
    assert.ok(
      graph.edges.some((r) => r.name === 'Express Mount: Root -> express.json()' && r.entityType === 'INTERCEPTS'),
      'Expected to extract Express Root -> express.json() mount as INTERCEPTS'
    );
});

test('analyzeTarget extracts CommonJS require as RELATIONSHIP', () => {
  const fixtureFile = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'express-app', 'app.js');
  const graph = analyzeTarget(fixtureFile);

  assert.ok(
    graph.edges.some((r) => r.name === 'Require: express' && r.entityType === 'REQUIRE'),
    'Expected to extract require("express") as RELATIONSHIP'
  );
  assert.ok(
    graph.edges.some((r) => r.name === 'Require: ./routes/api' && r.entityType === 'REQUIRE'),
    'Expected to extract require("./routes/api") as RELATIONSHIP'
  );
  assert.ok(
    graph.edges.some((r) => r.name === 'Require: ./routes/users' && r.entityType === 'REQUIRE'),
    'Expected to extract require("./routes/users") as RELATIONSHIP'
  );
});

test('analyzeTarget extracts CommonJS Module Export as BOUNDARY', () => {
  const fixtureFile = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'express-app', 'app.js');
  const graph = analyzeTarget(fixtureFile);

  assert.ok(
    graph.nodes.some((b) => b.name === 'CJS Export: default' && b.entityType === 'CJS_EXPORT'),
    'Expected to extract module.exports as BOUNDARY'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'CJS Export: init' && c.entityType === 'EXPORTED_FUNCTION'),
    'Expected to extract app.init as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Dynamic Export: app[method]' && c.entityType === 'CJS_METHOD'),
    'Expected to extract dynamic method assignment as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((c) => {
      const ev = Array.isArray(c.evidence) ? c.evidence[0] : c.evidence;
      return c.name === 'CJS Export: header' && c.entityType === 'EXPORTED_FUNCTION' && ev.snippet?.includes('req.header');
    }),
    'Expected to extract req.header assignment as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((c) => {
      const ev = Array.isArray(c.evidence) ? c.evidence[0] : c.evidence;
      return c.name === 'CJS Export: status' && c.entityType === 'EXPORTED_FUNCTION' && ev.snippet?.includes('res.status');
    }),
    'Expected to extract res.status assignment as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((c) => c.name === 'Property Getter: protocol' && c.entityType === 'PROPERTY_GETTER'),
    'Expected to extract Object.defineProperty protocol getter as CONTRACT'
  );
});

test('analyzeTarget extracts EventEmitter patterns', () => {
  const fixtureDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'node-events');
  const graph = analyzeTarget(fixtureDir);

  assert.ok(
    graph.nodes.some((c) => c.name === 'Event Listener: event' && c.entityType === 'EVENT_LISTENER'),
    'Expected to extract EventEmitter.on as CONTRACT'
  );
  assert.ok(
    graph.nodes.some((r) => r.name === 'Event Emit: event' && r.entityType === 'EVENT_EMIT'),
    'Expected to extract EventEmitter.emit as OPEN_CONNECTOR'
  );
});

test('analyzeTarget extracts Object.create as RELATIONSHIP', () => {
  const fixtureFile = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'express-app', 'inheritance.js');
  const graph = analyzeTarget(fixtureFile);

  assert.ok(
    graph.edges.some((r) => r.name === 'Inherits: http.IncomingMessage.prototype' && r.entityType === 'INHERITS'),
    'Expected to extract Object.create as RELATIONSHIP'
  );
  assert.ok(
    graph.edges.some((r) => r.name === 'Mixes: EventEmitter' && r.entityType === 'MIXES'),
    'Expected to extract prototype mixin as RELATIONSHIP'
  );
});

test('analyzeTarget extracts method calls as INFERRED RELATIONSHIP with confidence levels', () => {
  const fixtureDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'method-calls');
  const graph = analyzeTarget(fixtureDir);

  // HIGH confidence
  const createUserRel = graph.edges.find((r) => r.name === 'Call: userService.createUser()');
  assert.ok(createUserRel, 'Expected to extract userService.createUser()');
  assert.strictEqual(createUserRel.status, 'INFERRED');
  assert.strictEqual(createUserRel.confidence, 'HIGH');
  assert.ok(Array.isArray(createUserRel.evidence) && createUserRel.evidence.length === 3);

  // MEDIUM confidence
  const someMethodRel = graph.edges.find((r) => r.name === 'Call: otherService.someMethod()');
  assert.ok(someMethodRel, 'Expected to extract otherService.someMethod()');
  assert.strictEqual(someMethodRel.status, 'INFERRED');
  assert.strictEqual(someMethodRel.confidence, 'MEDIUM');
  assert.ok(Array.isArray(someMethodRel.evidence) && someMethodRel.evidence.length === 2);

  // LOW confidence
  const unknownMethodRel = graph.edges.find((r) => r.name === 'Call: globalService.unknownMethod()');
  assert.ok(unknownMethodRel, 'Expected to extract globalService.unknownMethod()');
  assert.strictEqual(unknownMethodRel.status, 'INFERRED');
  assert.strictEqual(unknownMethodRel.confidence, 'LOW');
  assert.ok(Array.isArray(unknownMethodRel.evidence) && unknownMethodRel.evidence.length === 1);
});

test('analyzeTarget extracts dynamic require and import as RELATIONSHIP', () => {
  const fixtureFile = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'dynamic-require', 'index.js');
  const graph = analyzeTarget(fixtureFile);

  assert.ok(
    graph.edges.some((r) => r.name === 'Dynamic Require: mod' && r.entityType === 'REQUIRE'),
    'Expected to extract require(mod) as RELATIONSHIP'
  );
  assert.ok(
    graph.edges.some((r) => r.name === 'Dynamic Require: engine' && r.entityType === 'REQUIRE'),
    'Expected to extract require(engine) as RELATIONSHIP'
  );
  assert.ok(
    graph.edges.some((r) => r.name === 'Import: path' && r.entityType === 'IMPORT'),
    'Expected to extract import("path") as RELATIONSHIP'
  );
  assert.ok(
    graph.edges.some((r) => r.name.includes('Dynamic Import:') && r.entityType === 'IMPORT'),
    'Expected to extract dynamic import() as RELATIONSHIP'
  );
});

test('analyzeTarget extracts monorepo workspace packages as BOUNDARY and resolves sibling imports as internal', () => {
  const fixtureDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'monorepo-pnpm');
  const graph = analyzeTarget(fixtureDir);

  // Verify WORKSPACE_PACKAGE boundaries are emitted
  const packageA = graph.nodes.find(n => n.name === 'Package: @acme/a' && n.entityType === 'WORKSPACE_PACKAGE');
  const packageB = graph.nodes.find(n => n.name === 'Package: @acme/b' && n.entityType === 'WORKSPACE_PACKAGE');
  
  assert.ok(packageA, 'Expected @acme/a workspace package boundary');
  assert.ok(packageB, 'Expected @acme/b workspace package boundary');

  // Verify files are assigned parent_boundary_id
  const fileA = graph.nodes.find(n => n.entityType === 'FILE' && n.name.includes('packages/a/index.ts'));
  const fileB = graph.nodes.find(n => n.entityType === 'FILE' && n.name.includes('packages/b/index.ts'));
  
  assert.ok(fileA, 'Expected file packages/a/index.ts');
  assert.ok(fileB, 'Expected file packages/b/index.ts');
  
  assert.strictEqual(fileA.parentBoundaryId, packageA.id, 'File A should be parented to Package A');
  assert.strictEqual(fileB.parentBoundaryId, packageB.id, 'File B should be parented to Package B');

  // Verify sibling import maps to the internal file boundary
  const siblingImport = graph.edges.find(e => e.name === 'Import: @acme/a');
  assert.ok(siblingImport, 'Expected Import: @acme/a edge');
  assert.strictEqual(siblingImport.sourceId, fileB.id, 'Import should originate from File B');
  
  // In the test suite, process.cwd() is packages/core but repoRoot is the fixture dir. 
  // pathResolver uses repoRoot, returning 'packages/a/index.ts'
  const expectedTargetId = stableEntityId('packages/a/index.ts', 'BOUNDARY', 'File: packages/a/index.ts');
  assert.strictEqual(siblingImport.targetId, expectedTargetId, 'Import should target File A (resolved via workspace registry)');
  
  // Verify NO EXTERNAL_PACKAGE was generated for @acme/a
  const externalA = graph.nodes.find(n => n.entityType === 'EXTERNAL_PACKAGE' && n.name.includes('@acme/a'));
  assert.ok(!externalA, 'Should not generate generic EXTERNAL_PACKAGE for workspace imports');
});

test('analyzeTarget extracts Next.js Server Actions and JSX Composition', () => {
  const fixtureDir = path.join(process.cwd(), '..', '..', 'fixtures', 'test-repos', 'nextjs-components');
  const graph = analyzeTarget(fixtureDir);

  const serverAction = graph.nodes.find(n => n.name === 'Server Action: updateUser' && n.entityType === 'SERVER_ACTION');
  assert.ok(serverAction, 'Expected to extract Server Action: updateUser');

  const jsxRender = graph.edges.find(e => e.name === 'Renders: <UserProfile />' && e.entityType === 'RENDERS');
  assert.ok(jsxRender, 'Expected to extract Renders: <UserProfile />');
});
