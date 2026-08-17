# Chomp — Software Representation Engine

> *Chomp gives software a structural voice — letting systems continuously and autonomously represent their own observable architecture.*

---

## What is Software Representation?

Modern software exists across dozens of services, repositories, and tools — but has no single, authoritative map of itself. Teams carry that map in their heads. When people leave, the map fades. When AI agents work with codebases, they operate without one entirely.

**Chomp** establishes *Software Representation* as a first-class engineering discipline: the practice of continuously extracting and maintaining a living structural model of a software system directly from its artifacts — not from documentation, not from diagrams, not from memory.

Chomp is **not** a code generator. It is **not** a documentation tool. It is a structural extraction engine that gives every team, tool, and AI agent access to a shared, evidence-backed representation of what their software actually is.

---

## Core Ontology

The ontology is strictly defined as **3 structural primitives + Open Connectors as a distinct non-peer category**.

### The 3 Structural Primitives
| Primitive | What it captures | Examples |
|---|---|---|
| **BOUNDARY** | Structural scopes — where a unit begins and ends | Classes, modules, namespaces, service files |
| **CONTRACT** | Explicit interfaces for inter-unit communication | Interfaces, type aliases, exported functions, API routes, event schemas |
| **RELATIONSHIP** | Known structural dependencies between units | Imports, inheritance, composition, router mounts |

### The Non-Peer Extension
| Category | What it captures | Examples |
|---|---|---|
| **OPEN_CONNECTOR** | Known exit points beyond the current evidence boundary | HTTP clients, database clients, message brokers, external service calls |

`schema.ts` in `packages/core` is the single source of truth; docs describe it, not the reverse. Open Connectors are structurally distinct from boundaries, contracts, and relationships and are not a fourth structural primitive on equal footing.

Nothing is fabricated — if the evidence doesn't exist in the code, Chomp won't invent the relationship.

---

## Architecture

```
chomp/
├── packages/
│   ├── core/           # Extraction engine: AST parsing, ontology types, SQLite persistence
│   └── cli/            # 'chomp' CLI: analyze, ledger, session, inventory commands
├── apps/
│   ├── backend/        # REST API + JWT auth
│   └── web/            # Next.js graph explorer UI
├── fixtures/
│   ├── test-repos/     # Committed minimal fixtures for unit tests
│   ├── cloned-repos/   # Git-ignored real-world repos for research runs
│   └── research/
│       ├── registry.json         # Session ledger (schema_version: v4)
│       ├── pattern_ledger.db     # Coverage gaps — one row per pattern class
│       ├── bug_tracker.db        # Correctness defects — one row per bug
│       └── sessions/*.md         # Per-session research reports
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
# Extraction
chomp analyze --repo <name> [--format json]      # Extracts AST and outputs ontology metrics
chomp health --repo <path>                        # Compute structural health metrics

# Coverage Ledger (legacy — existing gap tracking)
chomp ledger [--db <path>]                        # Display gap analysis ledger
chomp ledger log --repo <name> --file <path> ...  # Log an extraction gap

# Pattern Ledger (v4 — coverage gaps by pattern class)
chomp ledger patterns                             # List all pattern classes
chomp ledger pattern log --id <slug> --ontology <cat> --desc <text> [--sig <regex>]
chomp ledger pattern resolve --id <slug> --session <id> [--commit <sha>]
chomp ledger pattern status --id <slug> --status <unhandled|partial|handled>

# Bug Tracker (v4 — correctness defects)
chomp ledger bugs                                 # List all bugs
chomp ledger bug log --id <slug> --desc <text> --repo <r> --file <f> --session <id>
chomp ledger bug fix --id <slug> --session <id> [--commit <sha>]

# Inventory Sweep (v4 — Phase 1, deterministic, no LLM)
chomp inventory --repo <name>                    # Ripgrep sweep of all sweepable patterns

# Session Management (v4 typed sessions)
chomp session start --repo <name> --type <inventory|comparison|fix> [--target <slug>]
chomp session log-gaps --repo <name> --count <n>
chomp session close --repo <name> --resolved <n>
chomp session merge --repo <name>                # fix-type: health + tests enforced before merge

# System Audits
chomp audit start --topic <name>
chomp audit close --topic <name> --change <items..>
chomp audit merge --topic <name>
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
pnpm chomp analyze ./my-service
pnpm chomp health --repo ./my-service
```

### Run tests

```bash
pnpm test --filter @chomp/core
```

---

## Research Methodology (v4)

The v4 research loop is **fully deterministic in Phase 1** — no LLM calls, no manual copy-paste to AI Studio, no handoff directories. Three formal session types feed each other:

```
[Clone Repo] → [Inventory Session] → [Comparison Session] → [Fix Session] → [Merge]
                   (ripgrep sweep)     (rubric-driven AI)     (visitor code)
```

> **Agent Entry Point:** If you are an AI agent, you must enter this loop via the `research-loop` skill, which will orchestrate the raw CLI commands shown below on your behalf. **Do not** run these raw commands ad-hoc.

### Session Types

| Type | Branch | What it produces | AI? |
|---|---|---|---|
| **Inventory** | `research/inventory/<repo>-<date>` | Occurrence counts per known pattern; unhandled candidates flagged | No |
| **Comparison** | `research/compare/<repo>-<slug>-<date>` | Pattern Ledger and/or Bug Tracker entries from rubric check | Yes |
| **Fix** | `fix/<pattern-or-bug-id>-<date>` | Visitor code changes in `packages/core` | Optional |

### Step 0: Clone Target Repository

```bash
git clone <repo-url> fixtures/cloned-repos/<repo-name>
# Then register in fixtures/research/registry.json
```

### Step 1: Inventory Session (Phase 1 — deterministic)

```bash
# Start the session
TSX_DISABLE_IPC=1 pnpm chomp session start --repo <name> --type inventory

# Run the sweep (health-gated, no LLM, updates pattern_ledger.db occurrence counts)
TSX_DISABLE_IPC=1 pnpm chomp inventory --repo <name>

# Close the session
TSX_DISABLE_IPC=1 pnpm chomp session close --repo <name> --resolved 0
TSX_DISABLE_IPC=1 pnpm chomp session merge --repo <name>
```

### Step 2: Comparison Session (Phase 2 — AI-assisted, rubric-driven)

For each unhandled pattern flagged by the inventory sweep:

```bash
# Start comparison session targeting a specific file
TSX_DISABLE_IPC=1 pnpm chomp session start --repo <name> --type comparison --target <file-slug>

# AI compares target file against the pattern rubric.
# Log each confirmed finding directly:
TSX_DISABLE_IPC=1 pnpm chomp ledger pattern log --id <slug> --ontology <cat> --desc <text> --sig <regex>
TSX_DISABLE_IPC=1 pnpm chomp ledger bug log --id <slug> --desc <text> --repo <r> --file <f> --session <id>

TSX_DISABLE_IPC=1 pnpm chomp session close --repo <name> --resolved 0
TSX_DISABLE_IPC=1 pnpm chomp session merge --repo <name>
```

### Step 3: Fix Session (visitor implementation)

```bash
# Start fix session targeting a specific pattern
TSX_DISABLE_IPC=1 pnpm chomp session start --repo <name> --type fix --target <pattern-id>

# Implement the visitor fix in packages/core/src/extractor/visitors/
# Run tests
pnpm test --filter @chomp/core

# Close and merge — health + tests are enforced automatically before merge
TSX_DISABLE_IPC=1 pnpm chomp session close --repo <name> --resolved 1
TSX_DISABLE_IPC=1 pnpm chomp session merge --repo <name>   # ← refuses if health or tests fail

# Mark pattern resolved
TSX_DISABLE_IPC=1 pnpm chomp ledger pattern resolve --id <pattern-id> --session <session-id>
```

### Two Data Stores — Strictly Separated

**Pattern Ledger** (`fixtures/research/pattern_ledger.db`):
- One row per **pattern class** (a syntactic shape the extractor doesn't know yet)
- Has `detection_signature` for deterministic sweeping
- `chomp inventory` updates occurrence counts automatically

**Bug Tracker** (`fixtures/research/bug_tracker.db`):
- One row per **correctness defect** in an already-handled pattern
- Example: duplicate evidence records, wrong entity type assigned

> A missing pattern goes in the Pattern Ledger. A wrong result for a known pattern goes in the Bug Tracker. Never both.

---

## Agent Skills

| Skill | When to use |
|---|---|
| `research-loop` | Starting a new research session |
| `parser-builder` | Implementing new visitor or adapter logic |
| `fixture-builder` | Creating new test fixtures and ground-truth manifests |
| `architect-mode` | Discussing ontology design, schema changes, or strategy |

---

## Design Principles

1. **Reality over assumptions.** Extract only what is structurally evidenced in the code.
2. **Honest about unknowns.** An unknown is a valid structural state. Chomp never manufactures certainty.
3. **Deterministic first.** Phase 1 (inventory sweep) is 100% deterministic. Phase 2 (comparison) is AI-assisted but rubric-driven. AI inference is always labeled as probabilistic.
4. **Line-level traceability.** Every extracted entity links back to its exact source file and line number.
5. **Evidence-corroborated confidence.** 1 evidence source = low confidence. 2–3 = medium. 4+ = high.
6. **Coverage and correctness are separate concerns.** Pattern Ledger tracks unknown shapes. Bug Tracker tracks wrong output for known shapes. Conflating them makes coverage metrics meaningless.

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
| Frontend | Next.js, React (`apps/web`) |
| Backend API | Node.js, Express, JWT (`apps/backend`) |

---

*Built on the Software Representation thesis — the missing discipline of software development.*
