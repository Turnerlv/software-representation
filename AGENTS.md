# Software Representation Engine (`chomp`) — Agent Guidelines & System Context

This document outlines the core principles, data ontology, architecture, and scope for **chomp** (Software Representation Engine), derived from the foundational thesis ([`SR_ledger_2.1.md`](file://.context/SR_ledger_2.1.md)) and capstone specification ([`20260728_software_representation.pdf`](file://.context/20260728_software_representation.pdf)).

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

The structural model is built around **3 Structural Primitives + Open Connectors**:

| Primitive | Description | Examples |
| :--- | :--- | :--- |
| **Boundaries** | Scopes defining where structural units begin and end | Services, Modules, Packages, Repositories |
| **Contracts** | Explicit interfaces for communication between units | REST/GraphQL APIs, Schemas, Types, Events, Queues |
| **Relationships** | Known structural connections between entities | AST Imports, Function Calls, Dependencies, Composition |
| **Open Connectors** | Known points extending beyond available evidence | External APIs, Unlinked Databases, Message Brokers |

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

`chomp` is structured as a TypeScript monorepo managed via `pnpm` and `turbo`:

```
chomp/
├── packages/
│   ├── core/            # AST parsers (TS compiler API), ontology schemas, extraction engine
│   └── cli/             # Local CLI ('chomp analyze') for running extraction on repos
├── apps/
│   ├── backend/         # Node.js / Express REST API, JWT auth, PostgreSQL / SQLite graph persistence
│   └── frontend/        # Next.js Explorer UI (Interactive graph view & evidence traceability)
├── fixtures/
│   ├── test-repos/      # Committed minimal fixtures for unit tests
│   └── cloned-repos/    # Git-ignored real-world repos cloned for research (not committed)
└── .context/            # Thesis ledgers, architecture PDFs, project specs
```

### Core Technologies
- **Monorepo / Build:** `pnpm`, `turbo`, `typescript`
- **Backend API:** Node.js, Express, JWT, PostgreSQL / SQLite
- **Frontend Explorer:** React, Next.js, Vanilla CSS / Tailwind (if requested)
- **Parser Engine:** Tree-sitter / TypeScript AST compiler API

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

## 7. Rules for AI Agents Working on `chomp`

1. **Preserve Documentation Integrity:** Maintain explicit references to line numbers and evidence sources.
2. **Scope Boundaries:** Keep new features strictly focused on TypeScript/Node repository parsing and representation.
3. **Schema Compliance:** All extracted structures must adhere to the 4 ontology primitives (`Boundaries`, `Contracts`, `Relationships`, `Open Connectors`).
4. **Clean Code & Testing:** Write unit tests for AST extraction rules in `packages/core` before shipping extractor changes.

---

## 8. Architecture & Boundary Rules

1. **Ontology Isolation:** Core Ontology (`packages/core/src/types/ontology.ts`) must never import from Ledger, CLI tools, or external system modules.
2. **Visitor Isolation:** Extractor visitors must be kept isolated in `packages/core/src/extractor/visitors/` or `adapters/`.
3. **Modular Syntax Expansion:** Every new AST syntax rule must be implemented in a dedicated visitor/adapter file, not in the main orchestrator (`packages/core/src/extractor/index.ts`).

---

## 9. Research Workflow — Cloning & Evaluating Open-Source Repos

This is the standard cycle for expanding extractor coverage using real-world repositories. Each step maps to a specific skill or tool.

```
[Clone Repo] → [Run analyze] → [Inspect output] → [Eval gaps] → [Build fix] → [Re-run analyze] → [Confirm]
```

### Step-by-step

**Step 1 — Clone a target repo**
```bash
git clone <repo-url> fixtures/cloned-repos/<repo-name>
```
Cloned repos are git-ignored. They never get committed.

**Step 2 — Run extraction into an isolated DB**
```bash
# Always use --db to keep research runs isolated from the main chomp.db
pnpm chomp analyze fixtures/cloned-repos/<repo-name> --db fixtures/cloned-repos/<repo-name>.db
```

**Step 3 — Inspect output**
```bash
pnpm chomp ledger --db fixtures/cloned-repos/<repo-name>.db
```
Review the console table. Note entity counts per primitive type and any obvious missing patterns.

**Step 4 — Run gap analysis (invoke `parser-eval-harness` skill)**
Point an agent at the specific files where gaps are suspected (use the framework triage strategy in the skill). The agent will log gaps into the ledger using `logExtractionGap`.

**Step 5 — Build the fix (invoke `parser-builder` skill)**
For each `HIGH` or `MEDIUM` gap: implement a new or updated visitor in `packages/core/src/extractor/visitors/`. Write a unit test. Mark the ledger entry `RESOLVED`.

**Step 6 — Re-run extraction and confirm improvement**
```bash
pnpm test --filter @chomp/core
pnpm chomp analyze fixtures/cloned-repos/<repo-name> --db fixtures/cloned-repos/<repo-name>.db
pnpm chomp ledger --db fixtures/cloned-repos/<repo-name>.db
```
Verify the entity count increased and no regressions were introduced.

### Rules for research sessions
- One repo at a time. Finish the eval-build-verify loop before moving to the next.
- All gaps, even LOW-impact ones, must be logged before closing a session.
- Do NOT commit cloned repos or `.db` files from research runs.
- Run `pnpm test --filter @chomp/core` before and after every visitor change.