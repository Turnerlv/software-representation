# Software Representation Engine (`chomp`) — Agent Guidelines & System Context

This document is the authoritative reference for AI agents working on `chomp`. It defines the project's core philosophy, ontology, architecture, and research methodology.

---

## 1. Project Vision & Mission

**Mission:** Establish *Software Representation* as a missing discipline of software development that enables software systems to continuously and autonomously represent their own observable structure.

- **Not** to generate code.
- **Not** to manually document software.
- **Not** to govern or enforce software compliance.
- **Not** to replace existing tools (Figma, GitHub, Datadog, Jira).
- **To** provide a shared, living structural foundation that connects fragmented perspectives across teams, tools, and AI agents.

---

## 2. Core Philosophical Rules

1. **Reality Over Assumptions:** Extract what is structurally evidenced directly from artifacts before attempting to explain intent or rationale.
2. **The Principle of Incomplete Truth:** A trustworthy representation must be accurate about what it knows and honest about what it does not.
   - Explicitly distinguish **deterministic facts** from **inferred semantic hypotheses**.
   - An **unknown** is a valid structural state.
   - **Never manufacture certainty** or fabricate relationships to create the illusion of completeness.
3. **Knowledge Separation Triad:**
   - **Structure (What exists?):** Identifiable entities, boundaries, contracts, interfaces, relationships, open connectors. *(Primary MVP focus)*
   - **Behavior (What happens?):** Execution paths and telemetry. *(Future runtime enrichment)*
   - **Rationale (Why does it work this way?):** Human decisions, design tradeoffs, historical context.
4. **AI & Discovery Progression:**

   $$\text{AI Proposes} \longrightarrow \text{Evidence Corroborates} \longrightarrow \text{Humans Validate}$$

   - AI inference remains a hypothesis until corroborated by observable code evidence.
   - **Confidence Scoring** is based on independent evidence corroboration (1 source = low, 2–3 = medium, 4+ = high confidence).

---

## 3. Structural Data Ontology

The structural model uses **3 structural primitives + Open Connector as a distinct non-peer category**. Open Connector is NOT a fourth structural primitive on equal footing with Boundary/Contract/Relationship.

| Primitive | Description | Examples |
| :--- | :--- | :--- |
| **Boundaries** | Scopes defining where structural units begin and end | Services, Modules, Packages, Repositories |
| **Contracts** | Explicit interfaces for communication between units | REST/GraphQL APIs, Schemas, Types, Events, Queues |
| **Relationships** | Known structural connections between entities | AST Imports, Function Calls, Dependencies, Composition |
| **Open Connectors** | Known points extending beyond available evidence | External APIs, Unlinked Databases, Message Brokers |

`packages/core/src/db/schema.ts` is the single source of truth. All documentation describes it — never the reverse.

---

## 4. Extraction & Intelligence Pipeline

```
[01 Repo Artifacts] ──> [02 Deterministic AST Extraction] ──> [03 Structural Evidence]
                                                                      │
[06 Persistent Representation] <── [05 Corroboration] <── [04 Semantic Discovery (AI)]
```

1. **Repo Ingestion & Parsing:** Parse TypeScript / Node.js source files, configuration, and API definitions.
2. **Deterministic Extraction:** Derive boundaries, contracts, and call/import relationships with exact line-level source traceability (`file://` paths + line numbers).
3. **Evidence Graph:** Store evidence records establishing exact proof for every relationship.
4. **Semantic Discovery (Probabilistic):** AI proposes candidate relationships for open connectors or missing links.
5. **Corroboration & Verification:** Re-evaluate candidate links as additional repositories or evidence sources become available.

---

## 5. System Architecture & Tech Stack

`chomp` is a TypeScript monorepo managed via `pnpm` and `turbo`:

```
chomp/
├── packages/
│   ├── core/            # AST parsers (TS compiler API), ontology schemas, extraction engine
│   └── cli/             # Local CLI ('chomp analyze', 'chomp inventory', 'chomp session')
├── apps/
│   ├── backend/         # Node.js / Express REST API, JWT auth, SQLite graph persistence
│   └── web/             # Next.js Explorer UI (Interactive graph view & evidence traceability)
├── fixtures/
│   ├── test-repos/      # Committed minimal fixtures for unit tests
│   ├── cloned-repos/    # Git-ignored real-world repos cloned for research (not committed)
│   └── research/
│       ├── registry.json       # Session ledger (schema_version: v4)
│       ├── pattern_ledger.db   # Coverage gaps — one row per pattern class (git-ignored)
│       ├── bug_tracker.db      # Correctness defects (git-ignored)
│       └── sessions/*.md       # Per-session research reports
└── .context/            # Thesis ledgers, architecture PDFs, project specs
```

### Core Technologies
- **Monorepo / Build:** `pnpm`, `turbo`, `typescript`
- **Backend API:** Node.js, Express, JWT, SQLite via `better-sqlite3`
- **Frontend Explorer:** React, Next.js (`apps/web`)
- **Parser Engine:** TypeScript AST compiler API

---

## 6. MVP Scope & User Stories (Sprint 1)

### Must Have (5 Core Stories)
1. **Account & Authentication:** Secure JWT signup and login.
2. **Project Management:** Create and manage projects representing software systems.
3. **Repository Connection:** Connect local/GitHub repositories for analysis.
4. **Structural Extraction:** Run deterministic extraction pipeline to parse AST, boundaries, contracts, and relationships.
5. **Representation Explorer:** Interactive UI to navigate structural relationships and inspect underlying evidence records.

### Should Have
- **Line-Level Evidence Traceability:** Deep-linking from graph relationships back to exact source file lines.
- **Validation Experiment:** Benchmark AI code generation / editing tasks with vs. without structural representation context.

### Won't Have (Out of Scope for Sprint 1)
- Multi-language support (TypeScript / JavaScript Node repos only initially).
- Live runtime telemetry & log integration.
- Cross-repository automatic sync.
- External cloud service connectors.

---

## 7. Research Methodology (v4)

The v4 research loop replaces all previous ad-hoc methodologies. Three formal session types feed each other.

### Session Types

| Type | Branch Convention | AI? | Close Criteria |
|---|---|---|---|
| **Inventory** | `research/inventory/<repo>-<date>` | No | Every sweepable pattern has an occurrence count |
| **Comparison** | `research/compare/<repo>-<slug>-<date>` | Yes (rubric-driven) | Every rubric item for the target file has a recorded outcome |
| **Fix** | `fix/<pattern-or-bug-id>-<date>` | Optional | `chomp health` passes + `pnpm test` passes + targeted item has resolving session set |

### Two Data Stores — Strictly Separated

**Pattern Ledger** (`fixtures/research/pattern_ledger.db`):
- One row per **pattern class** (a syntactic shape the extractor doesn't know yet)
- `chomp inventory` sweeps these using `detection_signature` (ripgrep patterns)

**Bug Tracker** (`fixtures/research/bug_tracker.db`):
- One row per **correctness defect** in an already-handled pattern

> A missing pattern goes in the Pattern Ledger. A wrong result for a known pattern goes in the Bug Tracker. Never both.

### Entry Point

Always use the **`research-loop`** skill to start a new research session. Do not run ad-hoc `chomp analyze` commands against cloned repos.

---

## 8. Rules for AI Agents Working on `chomp`

1. **Health Before AI:** Never invoke AI analysis on a repository that fails `chomp health`. The inventory sweep (`chomp inventory`) calls the health gate automatically — do not bypass it.
2. **Log Immediately:** When a comparison session finds a pattern gap or bug, log it immediately via `chomp ledger pattern log` or `chomp ledger bug log`. Do not write a narrative summary and transcribe later — the compression step loses detail.
3. **Preserve Documentation Integrity:** Maintain explicit references to line numbers and evidence sources.
4. **Scope Boundaries:** Keep new features strictly focused on TypeScript/Node repository parsing and representation.
5. **Schema Compliance:** All extracted structures must adhere to the 3 structural primitives (plus Open Connectors). `schema.ts` is the authority.
6. **Clean Code & Testing:** Write unit tests for AST extraction rules in `packages/core` before shipping extractor changes. Tests must reference committed fixture files in `fixtures/test-repos/<framework>/` — never use inline `fs.writeFileSync` or temp directories.
7. **Controlled Fixtures:** Visitor logic is proven against `fixtures/test-repos/<framework>/expected.json` ground truths, never directly against live cloned repos.
8. **Do NOT commit:** Cloned repos, `.db` files, or `fixtures/research/handoffs/` directories.

---

## 9. Architecture & Boundary Rules

1. **Ontology Isolation:** Core Ontology (`packages/core/src/types/ontology.ts`) must never import from Ledger, CLI tools, or external system modules.
2. **Visitor Isolation:** Extractor visitors must be kept isolated in `packages/core/src/extractor/visitors/` or `adapters/`.
3. **Modular Syntax Expansion:** Every new AST syntax rule must be implemented in a dedicated visitor/adapter file, not in the main orchestrator (`packages/core/src/extractor/index.ts`).
4. **Separate Stores:** Pattern Ledger and Bug Tracker are separate SQLite files. No finding lives in both.
5. **Fix Session Gate:** Fix sessions are the only session type that may change `packages/core` code. Their merge is blocked by `chomp session merge` unless `chomp health` and `pnpm test --filter @chomp/core` both pass.