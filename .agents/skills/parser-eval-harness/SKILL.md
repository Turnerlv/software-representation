---
name: parser-eval-harness
description: Evaluates chomp analyze extraction output against target repositories to perform gap analysis and identify unhandled AST primitives.
---

# Parser Evaluation & Gap Analysis — Operational Guide

This skill governs how an agent evaluates a cloned repository's extraction output, identifies AST patterns the extractor cannot yet handle, and logs them as structured ledger entries for resolution.

---

## 0. Ground Rules

- **Do NOT read entire repositories into context.** Only inspect specific target files where gaps are suspected.
- **Do NOT re-run `chomp analyze` yourself.** Assume the user has already run it and will share the console output or the `chomp ledger` table. Your job is gap analysis, not orchestration.
- **Always log a ledger entry before ending a session.** Even a partially-characterized gap is better than silence. Use `DISCOVERED` status with a clear snippet.

---

## 1. What the Extractor Already Handles (Do NOT Log These as Gaps)

Before inspecting any file, internalize what the current extractor covers so you don't create duplicate ledger entries:

| Primitive | Currently Extracted Patterns |
|---|---|
| `BOUNDARY` | `class` declarations, `namespace`/`module` declarations, CommonJS module exports (`module.exports` / `exports.foo = ...`) |
| `CONTRACT` | `interface` declarations, `type` alias declarations, exported `function` declarations, Express route definitions (`app.get`, `app.post`, `router.get`, `app.route`, etc. with a string path literal), Express route parameters (`app.param`), Express content negotiation (`res.format`), aliased CommonJS module exports (`app.init = function()`, `req.header = ...`, `res.status = ...`), dynamic method assignments (`app[method] = function()`, `req[method] = ...`, `res[method] = ...`), object property getters (`Object.defineProperty(obj, name, { get: ... })`) |
| `RELATIONSHIP` | `import` declarations (static, named, default, namespace), CommonJS `require('module')` calls, Express router and middleware mounts (`app.use('/path', router)`, `app.use(middleware)`), Prototypal inheritance (`Object.create`, `Object.setPrototypeOf`), prototype mixins (e.g., `mixin(dest, src.prototype)`), inferred method calls |
| `OPEN_CONNECTOR` | Calls where the root identifier is in the HTTP allowlist (`fetch`, `axios`, `got`, `superagent`, `needle`, `request`, `ky`, `XMLHttpRequest`) or DB/broker allowlist (`prisma`, `knex`, `mongoose`, `sequelize`, `typeorm`, `drizzle`, `supabase`, `pg`, `mysql`, `mysql2`, `sqlite3`, `redis`, `dynamodb`, `bull`, `bullmq`, `amqplib`, `kafka`, `nats`), Express responses (`res.sendFile`, `res.download`, `res.render`, `res.redirect`, `res.send`, `res.json`, `res.jsonp`, `res.sendStatus`) |

If you see one of these patterns in the source and it IS in the `chomp analyze` output, it is working correctly — skip it.

---

## 2. File Triage Strategy — Where to Look First

Do not browse the repo randomly. Follow this priority order per framework:

### Express / Node.js (generic)
1. `src/routes/` or `src/router/` — route definitions (`app.get`, `router.post`, `app.use`)
2. `src/controllers/` — handler functions with inline route mounts
3. `src/middleware/` — `app.use(middleware)` patterns
4. `src/app.ts` or `src/server.ts` — top-level app assembly, router mounts
5. `src/models/` — Mongoose/Sequelize model definitions

### NestJS
1. `src/**/*.controller.ts` — `@Controller`, `@Get`, `@Post` etc. decorator patterns
2. `src/**/*.module.ts` — `@Module({ imports, providers, exports })` dependency graph
3. `src/**/*.service.ts` — `@Injectable`, constructor injection patterns
4. `src/**/*.guard.ts` / `src/**/*.interceptor.ts` — middleware contracts
5. `src/main.ts` — bootstrap and global middleware

### Next.js (App Router, v13+)
1. `app/**/route.ts` — API route handlers (`GET`, `POST` exports)
2. `app/**/page.tsx` — Server Component boundaries
3. `app/**/actions.ts` or files with `'use server'` — Server Actions
4. `app/**/layout.tsx` — layout boundary wrappers
5. `next.config.*` — runtime config, rewrites, redirects

### Next.js (Pages Router, legacy)
1. `pages/api/**/*.ts` — API route handlers
2. `pages/**/*.tsx` — page components

---

## 3. Pattern Checklist — What to Specifically Look For

For each file you inspect, explicitly evaluate whether these patterns are present and whether `chomp analyze` captured them. If present and NOT captured → log a gap.

### BOUNDARY gaps (things that define structural scope but aren't a `class`)
- [ ] `export default function Page()` / `export default function Component()` — Next.js page/component boundaries
- [ ] `export const handler = (req, res) => {}` — anonymous route handlers as named exports
- [ ] Arrow function components (`const MyComponent = () => <div />`) used as module exports
- [ ] NestJS `@Controller('path')` decorated class (currently caught as a `class`, but the route prefix metadata is lost)

### CONTRACT gaps (things that define a typed surface or route entry point)
- [ ] Express `router.get('/path', handler)` / `app.post('/path', handler)` / `app.route('/path')` — route definitions ✅ **Already handled by `expressAdapter.ts`**
- [ ] Express route parameters (`app.param`) ✅ **Already handled by `expressAdapter.ts`**
- [ ] Express content negotiation (`res.format`) ✅ **Already handled by `expressAdapter.ts`**
- [ ] NestJS `@Get('/path')`, `@Post('/path')` on a method — same idea
- [ ] Next.js `export async function GET(request)` / `POST` etc. in `route.ts` files ✅ **Already handled by `contractVisitor.ts`**
- [ ] `export const action = async (formData) => {}` — Next.js Server Actions
- [ ] Zod/Yup/Joi schema declarations — typed validation schemas ARE contracts
- [ ] `@ApiProperty()` / `@ApiResponse()` decorators (NestJS Swagger) — documented contracts
- [ ] `EventEmitter.on('eventName', handler)` — event contracts ✅ **Already handled by `eventEmitterVisitor.ts`**
- [ ] `Object.defineProperty(obj, name, { get: ... })` — object property getters ✅ **Already handled by `definePropertyVisitor.ts`**
- [ ] Aliased CommonJS module exports (e.g. `app.init = function()`, `req.header = ...`, `res.status = ...`) ✅ **Already handled by `commonjsExportVisitor.ts`**
- [ ] Dynamic method assignments (e.g. `app[method] = function()`, `res[method] = ...`) ✅ **Already handled by `commonjsExportVisitor.ts`**

### RELATIONSHIP gaps (things that describe structural dependencies beyond `import`)
- [ ] `app.use('/prefix', router)` / `app.use(middleware)` — Express router and middleware mounting (hierarchical dependency) ✅ **Already handled by `expressAdapter.ts`**
- [ ] `@Module({ imports: [OtherModule] })` — NestJS module dependency
- [ ] `extends BaseClass` — class inheritance (currently not captured)
- [ ] `Object.create(...)` / `Object.setPrototypeOf(...)` — prototypal inheritance ✅ **Already handled by `relationshipVisitor.ts`**
- [ ] Prototype mixins (`mixin(dest, src.prototype)`) — prototypal inheritance via mixin ✅ **Already handled by `relationshipVisitor.ts`**
- [ ] `implements Interface` — explicit contract implementation (currently not captured)
- [ ] `require('module')` — CommonJS require ✅ **Already handled by `relationshipVisitor.ts`**
- [ ] Dynamic `import('module')` — lazy-loaded imports (currently not captured)

### OPEN_CONNECTOR gaps (external calls beyond the current allowlists)
- [ ] `new WebSocket('wss://...')` — WebSocket connections
- [ ] `new EventSource('...')` — SSE connections
- [ ] `nodemailer.createTransport(...)` / `sendgrid.send(...)` — email services
- [ ] `stripe.charges.create(...)` / `paypal.payment.create(...)` — payment APIs
- [ ] `s3.putObject(...)` / `storage.upload(...)` — cloud storage
- [ ] `twilio.messages.create(...)` / `sns.publish(...)` — notification services
- [ ] `spawn(...)` / `exec(...)` from `child_process` — subprocess execution
- [ ] `fs.readFile` / `fs.writeFile` on dynamic paths — filesystem I/O boundaries
- [ ] `res.sendFile(...)` / `res.download(...)` / `res.render(...)` / `res.redirect(...)` / `res.send(...)` / `res.json(...)` / `res.jsonp(...)` / `res.sendStatus(...)` — Express responses ✅ **Already handled by `expressAdapter.ts`**

---

## 4. Ledger Entry Template

When you find a gap, log it directly into the SQLite database. Do NOT use raw SQL statements to do this, because they produce non-deterministic gap IDs. Instead, use the deterministic CLI command which securely hashes the file, line, and pattern:

```bash
TSX_DISABLE_IPC=1 pnpm chomp ledger log --repo <repo-folder-name> --file <evidenceFile> --line <evidenceLine> --pattern "<Pattern Name>" --framework "<Framework>" --impact <IMPACT> --snippet "<evidenceSnippet>" --db fixtures/cloned-repos/<repo-name>.db
```

For example:
```bash
TSX_DISABLE_IPC=1 pnpm chomp ledger log --repo fixtures/cloned-repos/express --file examples/hello-world/index.js --line 7 --pattern "Express Route Definition" --framework Express --impact HIGH --snippet "app.get('/path', function(req, res){" --db fixtures/cloned-repos/express.db
```

**Naming conventions for `pattern_name`:**
- Use title case: `Express Router Mount`, not `express router mount`
- Be specific about the framework variant: `NestJS @Get Decorator` not `GET route`
- If it maps to multiple primitives, pick the most important: a route definition is a `CONTRACT`, not a `BOUNDARY`


---

## 5. Gap Classification Rules

### Impact Level

| Level | Use when |
|---|---|
| `HIGH` | The pattern is fundamental to the framework's primary structural model. Missing it means the entire service boundary or route surface is invisible. Examples: Express route definitions, NestJS controller methods, Next.js API routes. |
| `MEDIUM` | The pattern appears frequently and adds meaningful structure but the core representation is still intelligible without it. Examples: middleware mounts, Zod schemas, class inheritance. |
| `LOW` | The pattern is present but peripheral — the structural picture is complete without it. Examples: `EventEmitter.on` for internal events, `fs.readFile` on static paths. |

### Status

| Status | Use when |
|---|---|
| `DISCOVERED` | You've confirmed the pattern is unhandled. No fix exists yet. **Default for all new gaps.** |
| `IN_PROGRESS` | A parser-builder session is actively working on this gap. |
| `RESOLVED` | A visitor has been implemented and a test fixture exists. Do NOT mark RESOLVED yourself — the `parser-builder` skill owns this transition. |
| `OUT_OF_SCOPE` | The pattern falls outside TypeScript/Node.js (e.g., Python decorators, Go struct tags). |

---

## 6. Session Output Checklist & Human Gate

Before ending an eval session on a repo, confirm:
- [ ] Every HIGH-impact gap has been logged with a line number and snippet via `chomp ledger log`.
- [ ] Every MEDIUM-impact gap has been logged, even if the line number is approximate.
- [ ] No duplicate ledger entries were created for patterns already in the ledger.
- [ ] **Document the Session**: If this skill is run as part of the `research-loop`, ensure the gaps are appended to the `fixtures/research/sessions/<session_id>.md` report as a "Research Brief". If you are running in isolation, produce a Research Brief locally or in the chat.
- [ ] **Human Validation**: **🛑 STOP and explicitly ask the human to validate the discovered gaps and build plan BEFORE handing off to the `parser-builder` skill or concluding the session.** Do not proceed without explicit human consent.
- [ ] **Doc Drift Reminder**: Note that as you resolve these gaps later, the checklists in Section 3 of this document will become outdated. Do NOT modify this prompt yourself. The `doc-drift-audit` skill will automatically sync these checklists after the session is fully resolved.