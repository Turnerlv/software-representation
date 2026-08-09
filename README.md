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
The local CLI for running extraction. Two commands:

```
chomp analyze <path> [--db <path>]   # Extract + persist a repo's structural graph
chomp ledger [--db <path>]           # Inspect the extractor coverage ledger
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

## Research Workflow

The standard loop for expanding extractor coverage against real-world repos:

```
[Clone Repo] -> [Run analyze] -> [Inspect ledger] -> [Eval gaps] -> [Build fix] -> [Re-run] -> [Confirm]
```

```bash
# Step 1 - Clone (repos are git-ignored)
git clone <repo-url> fixtures/cloned-repos/<repo-name>

# Step 2 - Analyze into isolated DB
pnpm chomp analyze fixtures/cloned-repos/<repo-name> --db fixtures/cloned-repos/<repo-name>.db

# Step 3 - Inspect output
pnpm chomp ledger --db fixtures/cloned-repos/<repo-name>.db

# Step 4 - Gap analysis  -> parser-eval-harness skill
# Step 5 - Build fix     -> parser-builder skill
# Step 6 - Confirm
pnpm test --filter @chomp/core
pnpm chomp analyze fixtures/cloned-repos/<repo-name> --db fixtures/cloned-repos/<repo-name>.db
```

See [AGENTS.md](./AGENTS.md) Section 9 for the full step-by-step rules.

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
