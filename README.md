# Chomp — Software Representation Engine

> *Chomp gives software a structural voice — letting systems continuously and autonomously represent their own observable architecture.*

---

## What is Software Representation?

Modern software exists across dozens of services, repositories, and tools — but has no single, authoritative map of itself. Teams carry that map in their heads. When people leave, the map fades. When AI agents work with codebases, they operate without one entirely.

**Chomp** establishes *Software Representation* as a first-class engineering discipline: the practice of continuously extracting and maintaining a living structural model of a software system directly from its artifacts — not from documentation, not from diagrams, not from memory.

Chomp is **not** a code generator. It is **not** a documentation tool. It is a structural extraction engine that gives every team, tool, and AI agent access to a shared, evidence-backed representation of what their software actually is.

---

## Core Ontology

Every extracted structure maps to one of four primitives:

| Primitive | What it captures | Examples |
|---|---|---|
| **BOUNDARY** | Structural scopes — where a unit begins and ends | Classes, modules, namespaces, service files |
| **CONTRACT** | Explicit interfaces for inter-unit communication | Interfaces, type aliases, exported functions, API routes, event schemas |
| **RELATIONSHIP** | Known structural dependencies between units | Imports, inheritance, composition, router mounts |
| **OPEN_CONNECTOR** | Known exit points beyond the current evidence boundary | HTTP clients, database clients, message brokers, external service calls |

The ontology is intentionally minimal. Every pattern extracted must map to exactly one of these four. Nothing is fabricated — if the evidence doesn't exist in the code, Chomp won't invent the relationship.

---

## Architecture

```
chomp/
├── packages/
│   ├── core/           # Extraction engine: AST parsing, ontology types, SQLite persistence
│   └── cli/            # 'chomp' CLI: analyze and ledger commands
├── apps/
│   ├── backend/        # REST API + JWT auth (Sprint 2)
│   └── frontend/       # Next.js graph explorer UI (Sprint 2)
├── fixtures/
│   ├── test-repos/     # Committed minimal fixtures for unit tests
│   └── cloned-repos/   # Git-ignored real-world repos for research runs
└── .agents/
    └── skills/         # Agent skills for research, building, and architecture
```

### `@chomp/core`
The extraction engine. Parses TypeScript and JavaScript source files using the TypeScript compiler API. Outputs a `RepresentationGraph` containing all four primitive types with line-level `EvidenceRecord` traceability. Persists to SQLite via `better-sqlite3`.

**Internal pipeline:**
```
collectFiles()
  └── analyzeTarget()
        ├── boundaryVisitor    → BOUNDARY entities
        ├── contractVisitor    → CONTRACT entities
        ├── relationshipVisitor → RELATIONSHIP entities
        └── openConnectorVisitor → OPEN_CONNECTOR entities
              └── stableEntityId() → SHA-256 content-based IDs
```

### `@chomp/cli`
The local CLI for running extraction and research session orchestration:

```bash
chomp analyze --repo <name> [--format json]      # Extracts AST and outputs ontology metrics
chomp ledger [--db <path>]                        # Displays gap analysis ledger
chomp ledger log --repo <name> --file <path> ...  # Deterministically logs an extraction gap
chomp session start --repo <name> [--force]         # Setup session, branch, DB, and report stub
chomp audit prepare --repo <name>                   # Export current_extraction.json & system_prompt.md for AI Studio
chomp ledger import --file <path> --repo <name>   # Import studio_output.json into SQLite ledger
chomp session log-gaps --repo <name> --count <n>    # Record logged gaps and commit report
chomp session close --repo <name> --resolved <n>    # Re-analyze graph, record final state & complete
chomp session merge --repo <name>                   # Push, checkout main, merge --no-ff & patch bump @chomp/core
chomp audit start --topic <name>                    # Setup system audit, branch, and report stub
chomp audit close --topic <name> --change <items..> # Close audit and log changes to registry
```

---

## Quick Start

### Prerequisites
- Node.js >= 18
- pnpm >= 9

### Install

```bash
pnpm install
```

### Analyze a local repo

```bash
# Analyze into the default workspace DB
pnpm chomp analyze ./my-service

# Analyze into an isolated research DB
pnpm chomp analyze fixtures/cloned-repos/my-repo --db fixtures/cloned-repos/my-repo.db
```

### Inspect the extractor coverage ledger

```bash
# Default workspace DB
pnpm chomp ledger

# Research DB
pnpm chomp ledger --db fixtures/cloned-repos/my-repo.db
```

### Run tests

```bash
pnpm test --filter @chomp/core
```

---

## Manual Research Workflow

This step-by-step workflow expands Chomp's AST extractor coverage against real-world repositories without relying on automated bridge API calls.

> **Note on `<repo-name>`:** `<repo-name>` refers to the repository **identifier** registered under `repos` in [`fixtures/research/registry.json`](file:///Users/turnervickery/code/chomp/fixtures/research/registry.json) (e.g. `express`), **not** a file path. The CLI automatically maps `<repo-name>` to `fixtures/cloned-repos/<repo-name>` and `fixtures/cloned-repos/<repo-name>.db`.

```
[0. Clone Repo] ──> [1. Session Start] ──> [2. Prepare Handoff] ──> [3. Manual Studio Audit]
                                                                              │
[7. Merge & Bump] <── [6. Session Close] <── [5. Build Fixes] <── [4. Import & Log Gaps]
```

---

### Step 0: Clone Target Repository

- **What it is:** Clone the repository to analyze into the fixtures directory.
- **What it does:** Downloads the target repository source code so Chomp can extract AST primitives.
- **Command to run:**
  ```bash
  git clone <repo-url> fixtures/cloned-repos/<repo-name>
  ```
- **Files modified:** Register the repository entry under `repos` in `fixtures/research/registry.json`.

---

### Step 1: Start Research Session

- **What it is:** Initialize a new research session and isolated git branch.
- **What it does:** Checks extractor version, parses the repository into `fixtures/cloned-repos/<repo-name>.db`, creates a `research/<repo-name>-<timestamp>` branch, generates a session report stub at `fixtures/research/sessions/<session_id>.md`, sets session status to `IN_PROGRESS` in `registry.json`, and commits baseline metrics.
- **Command to run:**
  ```bash
  TSX_DISABLE_IPC=1 pnpm chomp session start --repo <repo-name>
  ```
  *(Add `--force` if a completed session already exists for the current extractor version).*
- **Files created/modified:**
  - `fixtures/cloned-repos/<repo-name>.db`
  - `fixtures/research/sessions/<session_id>.md`
  - `fixtures/research/registry.json`

---

### Step 2: Export Assets for AI Studio

- **What it is:** Generate handoff files for manual gap analysis in Google AI Studio.
- **What it does:** Exports the extracted graph (`current_extraction.json`) and Oracle prompt (`system_prompt.md`) into a handoff directory.
- **Command to run:**
  ```bash
  TSX_DISABLE_IPC=1 pnpm chomp audit prepare --repo <repo-name>
  ```
- **Files created:**
  - `fixtures/research/handoffs/<repo-name>-<date>/current_extraction.json`
  - `fixtures/research/handoffs/<repo-name>-<date>/system_prompt.md`

---

### Step 3: Run Gap Analysis in Google AI Studio (Manual)

- **What it is:** Perform manual structural gap analysis using Google AI Studio.
- **What it does:** Queries Gemini 1.5 Pro with Chomp's baseline extraction graph and raw source files to identify missing primitives (`BOUNDARY`, `CONTRACT`, `RELATIONSHIP`, `OPEN_CONNECTOR`) or schema evolutions.
- **Actions to take:**
  1. Open [Google AI Studio](https://aistudio.google.com/).
  2. Upload `fixtures/research/handoffs/<repo-name>-<date>/current_extraction.json` and target repository source files.
  3. Copy the contents of `fixtures/research/handoffs/<repo-name>-<date>/system_prompt.md` into System Instructions / Prompt.
  4. Run the model and copy the generated JSON output array.
  5. Save the output JSON array locally to `fixtures/research/handoffs/<repo-name>-<date>/studio_output.json`.
- **Files created:** `fixtures/research/handoffs/<repo-name>-<date>/studio_output.json`

---

### Step 4: Import Discoveries & Log Gaps

- **What it is:** Import AI Studio discoveries into SQLite ledger and record logged gaps.
- **What it does:** Loads `studio_output.json` into `fixtures/cloned-repos/<repo-name>.db`, displays the gap ledger, updates `registry.json`, and commits the session report.
- **Commands to run:**
  ```bash
  # 1. Import discoveries into SQLite ledger
  TSX_DISABLE_IPC=1 pnpm chomp ledger import --file fixtures/research/handoffs/<repo-name>-<date>/studio_output.json --repo <repo-name>

  # 2. View imported gaps in ledger
  TSX_DISABLE_IPC=1 pnpm chomp ledger

  # 3. Log gap count and commit session report
  TSX_DISABLE_IPC=1 pnpm chomp session log-gaps --repo <repo-name> --count <number_of_gaps>
  ```
- **Files modified:**
  - `fixtures/cloned-repos/<repo-name>.db`
  - `fixtures/research/registry.json`
  - `fixtures/research/sessions/<session_id>.md`

---

### Step 5: Implement AST Extractor Fixes (`parser-builder`)

- **What it is:** Implement new AST visitor or adapter logic in `@chomp/core` to resolve gaps.
- **What it does:** Extends TypeScript AST parsing capabilities for discovered patterns, accompanied by committed test fixtures and documentation updates.
- **Actions & Commands to run:**
  1. **Write Extractor Logic:**
     - Framework-agnostic patterns: `packages/core/src/extractor/visitors/<visitorName>.ts`
     - Framework-specific adapters: `packages/core/src/extractor/adapters/<framework>Adapter.ts`
     - *(Do not add inline logic directly to `packages/core/src/extractor/index.ts`)*.
  2. **Add Test Fixture:**
     - Create minimal fixture files in `fixtures/test-repos/<framework-name>/`.
  3. **Run Unit Tests:**
     ```bash
     pnpm test --filter @chomp/core
     ```
  4. **Update Documentation:**
     - Mark resolved patterns with `✅` in `.agents/skills/parser-eval-harness/SKILL.md` (Sections 1 & 3).
- **Files modified/created:**
  - `packages/core/src/extractor/visitors/*` or `adapters/*`
  - `fixtures/test-repos/<framework-name>/*`
  - `.agents/skills/parser-eval-harness/SKILL.md`

---

### Step 6: Close Research Session

- **What it is:** Re-analyze the repository and finalize session metrics.
- **What it does:** Re-runs AST extraction, records post-fix entity counts and resolved gap metrics, sets session status to `COMPLETE` in `registry.json`, and commits the session report.
- **Command to run:**
  ```bash
  TSX_DISABLE_IPC=1 pnpm chomp session close --repo <repo-name> --resolved <number_resolved>
  ```
- **Files modified:**
  - `fixtures/research/registry.json`
  - `fixtures/research/sessions/<session_id>.md`

---

### Step 7: Merge Branch & Patch Bump Version

- **What it is:** Merge the research branch into `main` and bump `@chomp/core` version.
- **What it does:** Pushes research branch to remote, checks out `main`, performs a `--no-ff` merge, bumps `@chomp/core` patch version in `packages/core/package.json`, and commits.
- **Command to run:**
  ```bash
  TSX_DISABLE_IPC=1 pnpm chomp session merge --repo <repo-name>
  ```
- **Files modified:**
  - `packages/core/package.json`
`
---

## Agent Skills

Three skills are available for AI-assisted research and development:

| Skill | Trigger when... |
|---|---|
| `parser-eval-harness` | Evaluating a cloned repo's extraction output and identifying AST gaps |
| `parser-builder` | Implementing new visitor or adapter logic to resolve a logged gap |
| `architect-mode` | Discussing ontology design, schema changes, or engineering strategy |

---

## Design Principles

1. **Reality over assumptions.** Extract only what is structurally evidenced in the code.
2. **Honest about unknowns.** An unknown is a valid structural state. Chomp never manufactures certainty.
3. **Deterministic first.** AST extraction is fully deterministic. AI inference is probabilistic and labeled as such.
4. **Line-level traceability.** Every extracted entity links back to its exact source file and line number.
5. **Evidence-corroborated confidence.** 1 evidence source = low confidence. 2-3 = medium. 4+ = high.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | `pnpm` workspaces + `turbo` |
| Language | TypeScript (ESM) |
| AST Parser | TypeScript Compiler API (`ts.createSourceFile`) |
| Persistence | SQLite via `better-sqlite3` |
| CLI Framework | `commander` |
| Test Runner | Node.js built-in `node:test` + `tsx` |
| Frontend (Sprint 2) | Next.js, React |
| Backend API (Sprint 2) | Node.js, Express, JWT |

---

*Built on the Software Representation thesis — the missing discipline of software development.*
