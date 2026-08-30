---
name: research-loop
description: Orchestrates a v4 research session against a cloned repository. Uses the three-session-type model (inventory → comparison → fix) with deterministic CLI commands and health-gated merges.
---

# `research-loop` Skill

This skill orchestrates a research session using the **v4 methodology**: a deterministic Phase 1 inventory sweep, followed by a rubric-driven AI comparison, followed by a fix session. Each phase is a bounded git branch with specific close criteria.

> **Do not** use `chomp research start/close` (deleted) or `chomp audit prepare` (deleted).
> All findings are logged directly via CLI — no narrative-first, table-later compression step.

## Prerequisites

1. Target repo cloned to `fixtures/cloned-repos/<repo-name>`.
2. Target repo registered in `fixtures/research/registry.json`.
3. At least one pattern in `fixtures/research/pattern_ledger.db` with a `detection_signature` (or plan to seed one during this session).

> **🤖 AI Agent Note:** When executing `pnpm chomp` or `pnpm test` commands via the `run_command` tool, you **must set `BypassSandbox: true`**. The standard execution sandbox restricts access to `/var/folders/` (which `tsx` requires for IPC socket creation) and `~/.npmrc` (which `pnpm` reads), leading to `EPERM: operation not permitted` errors if the sandbox is not bypassed.

> **🌳 Worktree Note:** When instructed to run a research loop for a framework/repo (e.g., `express`), **ALWAYS** check if an existing epic worktree branch already exists for it (e.g., run `git worktree list` or `git branch -a` to look for a branch like `research_express_loop`). If an epic branch/worktree already exists, you **MUST** run the research inside that existing worktree/branch to build upon prior work. Do NOT branch off `main` or create a redundant new worktree for the same repo.

---

## Stage 1: Inventory Session (deterministic, no LLM)

> **⚠️ Submodule Note:** All research state (`pattern_ledger.db`, `bug_tracker.db`, `sessions/*.md`) is stored in the `fixtures/research` Git Submodule. Any session commands that mutate this data must be committed and pushed from *inside* `fixtures/research/` before committing the main monorepo!

```bash
# 1. Start the session — creates branch research/inventory/<repo>-<date>
TSX_DISABLE_IPC=1 pnpm chomp-research session start --repo <name> --type inventory

# 2. Run the deterministic pattern sweep (health-gated internally)
TSX_DISABLE_IPC=1 pnpm chomp-research inventory --repo <name>
```

Read the output table:
- **Occurrences > 0, Status = unhandled** → target for comparison session
- **Occurrences = 0** → repo doesn't exercise this shape (skip for now)
- **No sweepable patterns** → seed a pattern first: `chomp ledger pattern log --id <slug> --ontology <cat> --desc <text> --sig <regex>`
- **0 unhandled patterns found (100% known coverage)** → The session is NOT over. You must proactively select 1-3 untested architectural files (e.g., a database model, a router, a controller, or middleware) and flag them for an Exploratory Comparison Session to discover brand-new unknown patterns.

```bash
# 3. Close and merge the inventory session
TSX_DISABLE_IPC=1 pnpm chomp-research session close --repo <name> --resolved 0
TSX_DISABLE_IPC=1 pnpm chomp-research session merge --repo <name>
```

---

## Stage 2: Comparison Session (AI-assisted, rubric-driven)

For each unhandled pattern flagged by the inventory (or for each file selected for Exploratory Sampling):

```bash
# 1. Start comparison session targeting a specific file
TSX_DISABLE_IPC=1 pnpm chomp-research session start --repo <name> --type comparison --target <file-slug>
```

Rubric = every pattern class Phase 1 found present in the target file + the standing checklist in `.context/chomp_extraction_ideal.md`.

For each rubric item, confirm one of:
- **present-and-correct** → no action
- **present-and-wrong** → `chomp ledger bug log ...` → Bug Tracker
- **absent-from-graph (known shape)** → `chomp ledger pattern resolve ...` or update status
- **absent-from-graph (new shape)** → `chomp ledger pattern log --id <slug> --ontology <cat> --desc <text> --sig <regex>` → Pattern Ledger as `unhandled`

Log findings **immediately via CLI** — not as a chat narrative first:

```bash
# New pattern class discovered
TSX_DISABLE_IPC=1 pnpm chomp-research ledger pattern log \
  --id route.regexp-literal \
  --ontology CONTRACT \
  --desc "Express route defined with a RegExp literal instead of a string path" \
  --sig "app\.(get|post|put|delete|use)\s*\(\s*/" \
  --repo <name> --session <session-id>

# Correctness bug discovered
TSX_DISABLE_IPC=1 pnpm chomp-research ledger bug log \
  --id dup-evidence-<repo>-<slug> \
  --desc "Duplicate VIEW_RENDER evidence record for same call site" \
  --repo <name> --file <path> --line <n> --session <session-id>
```

```bash
# 2. Close the comparison session
TSX_DISABLE_IPC=1 pnpm chomp-research session close --repo <name> --resolved 0
TSX_DISABLE_IPC=1 pnpm chomp-research session merge --repo <name>
```

---

## Stage 3: Fix Session (visitor implementation)

```bash
# 1. Start fix session — creates branch fix/<pattern-id>-<date>
TSX_DISABLE_IPC=1 pnpm chomp-research session start --repo <name> --type fix --target <pattern-id>
```

Implement the visitor in `packages/core/src/extractor/visitors/` or `adapters/`.
Add a fixture in `fixtures/test-repos/<framework>/` with ground-truth `expected.json`.

```bash
# 2. Run tests
pnpm test --filter @chomp/core

# 3. Commit your code changes!
git add packages/core/ fixtures/test-repos/
git commit -m "feat(core): implement extractor for <pattern-id>"

# 4. Mark the pattern resolved (NOTE: do not use non-existent flags like --pr)
# DO THIS BEFORE MERGING so the ledger is updated and tests pass
TSX_DISABLE_IPC=1 pnpm chomp-research ledger pattern resolve \
  --id <pattern-id> --session <session-id>

# 5. Close and merge — workspace cleanliness + health + pnpm test enforced automatically
TSX_DISABLE_IPC=1 pnpm chomp-research session close --repo <name> --resolved 1
TSX_DISABLE_IPC=1 pnpm chomp-research session merge --repo <name>
```

---

## Close Criteria (per session type)

| Type | Done when... |
|---|---|
| **Inventory** | Every sweepable pattern has an occurrence count for this repo; new candidates handed to comparison |
| **Comparison** | Every rubric item for the target file has a recorded outcome in Pattern Ledger or Bug Tracker |
| **Fix** | `chomp health` passes, `pnpm test --filter @chomp/core` passes, targeted pattern/bug has `resolving_session_id` set |

Fix session merge **refuses automatically** if health or tests fail — no manual check needed.
