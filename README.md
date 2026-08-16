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
[0. Clone Repo] ──> [1. Health Metrics Gate] ──> [2. Deep Analysis (AI)] ──> [3. Audit & Record]
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

### Step 1: Structural Health Metrics Gate

- **What it is:** Run the structural health metrics against the cloned repository.
- **What it does:** Ensures that the extracted structural representation is complete enough to be reasoned about by AI. If this fails, AI analysis must NOT proceed.
- **Command to run:**
  ```bash
  pnpm chomp health --repo fixtures/cloned-repos/<repo-name>
  ```
- **Actions to take:**
  - If **FAIL**: Stop. You must implement AST extraction logic for the missing structural patterns. Proceed to `fixture-builder` to author deterministic `expected.json` ground truths, build the parser fix, verify against the test suite, and run `health` again.
  - If **PASS**: Proceed to Deep Analysis.

---

### Step 2: Deep Analysis (AI Oracle)

- **What it is:** Perform manual or automated structural analysis on a healthy graph.
- **What it does:** Queries the Oracle (e.g., Gemini 1.5 Pro) with Chomp's structurally sound extraction graph to infer semantic architectures, deferred `CALL` resolutions, or missing contexts.
- **Actions to take:**
  - Invoke the `deep-analysis` skill to bridge to Google AI Studio.

---

### Step 3: Audit & Record

- **What it is:** Record the session and audit system state.
- **What it does:** Produces deep-analysis output reports and tracks doc-drift.
- **Actions to take:**
  - Log findings in `fixtures/research/analysis/`.
  - Invoke `system-audit` or `doc-drift-audit`.

---

## Agent Skills

Four skills are available for AI-assisted research and development:

| Skill | Trigger when... |
|---|---|
| `research-loop` | Orchestrating a full research session on a target repository |
| `fixture-builder` | Building new test fixtures and deterministic `expected.json` ground truths for extraction |
| `parser-builder` | Implementing new visitor or adapter logic in `@chomp/core` to resolve a fixture gap |
| `deep-analysis` | Performing strategic AI analysis on a repository that passes health metrics |

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
