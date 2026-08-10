---
name: doc-drift-audit
description: Reactively audits skill and documentation files after another skill completes (e.g. research-loop) to identify doc drift — stale commands, wrong table names, outdated checklists — and logs issues to fixtures/research/doc-drift-issues.md without modifying any source files.
---

# `doc-drift-audit` Skill

Run this skill **after** another skill has completed (e.g. `research-loop`, `parser-builder`). It inspects what happened during that session and compares it against the documentation in `.agents/skills/` to find drift. It logs every issue it finds but **never modifies any skill or source file** — that is the job of `doc-drift-fix`.

> **CRITICAL:** Do not fix anything. Do not edit skills. Do not commit to main. Only read and log.

---

## Input

Before starting, identify the triggering session context:
- If invoked after `research-loop`: read the most recent session report from `fixtures/research/sessions/` and `fixtures/research/registry.json`.
- If invoked after `parser-builder`: note which visitor/adapter file was created or modified.
- If invoked ad-hoc: audit all skills in `.agents/skills/` against the current codebase state.

---

## Stage 1 — Gather Evidence

Read the following without modifying them:

1. **Session artefacts** (if research-loop):
   - The most recent session report (`fixtures/research/sessions/<session_id>.md`)
   - `fixtures/research/registry.json` — check `extractor_version` against `packages/core/package.json`

2. **Skill files** — read each `SKILL.md` in `.agents/skills/`:
   - `research-loop/SKILL.md`
   - `parser-eval-harness/SKILL.md`
   - `parser-builder/SKILL.md`

3. **Live codebase signals**:
   - `packages/core/package.json` — current `version`
   - `packages/core/src/extractor/adapters/` — list of existing adapters
   - `packages/core/src/extractor/visitors/` — list of existing visitors
   - `packages/core/src/db/schema.ts` — authoritative table names

---

## Stage 2 — Run the Drift Checks

For each check below, note any mismatch. A mismatch = one issue entry.

### 2a. CLI Commands
- Any `pnpm chomp` call in a skill that is **missing** `TSX_DISABLE_IPC=1` prefix.
- Any command in a skill referencing a `--db` flag path that doesn't match the convention `fixtures/cloned-repos/<repo-name>.db`.

### 2b. Table Names
- Any raw SQL query in a skill referencing `entities` instead of `structural_entities`.
- Cross-check all table names in skills against `packages/core/src/db/schema.ts`.

### 2c. Checklist Items (parser-eval-harness)
- Any checklist item marked as "currently not captured" or with no ✅ marker that IS now handled by an adapter or visitor in `packages/core/src/extractor/adapters/` or `visitors/`.
- Any checklist item marked ✅ that references a file that **no longer exists**.

### 2d. Extractor Version Consistency
- Compare the `extractor_version` in each COMPLETE session in `registry.json` against `packages/core/package.json` version.
- If the last COMPLETE session's `extractor_version` matches the current `packages/core` version **and** parser changes have since landed (i.e., new files in `adapters/` or `visitors/` that post-date the session), log it as drift: the version needs a bump.

### 2e. Step Numbering
- Scan each `SKILL.md` for duplicate or out-of-sequence step numbers within any `## Stage N` section.

### 2f. Stale File References
- Any `Proposed fix:` path in a session report or skill pointing to a file that doesn't exist yet AND whose gap is now marked `RESOLVED`. The file should exist — if it doesn't, log it.
- Any skill referencing a file path that has moved or been renamed.

### 2g. Guard Logic Assumptions
- In `research-loop/SKILL.md` Step 2: confirm the guard compares `extractor_version` (not `pinned_commit`). If it compares `pinned_commit` alone, log it.

---

## Stage 3 — Log Issues

For every mismatch found, append an entry to `fixtures/research/doc-drift-issues.md`. Create the file if it doesn't exist.

Use this format exactly:

```markdown
---
**File:** `<relative path>`
**Line(s):** <line number(s), or "unknown">
**Issue type:** <wrong-command | stale-checklist | wrong-table-name | wrong-step-number | outdated-assumption | stale-file-ref | version-drift | missing-note>
**Description:** <one sentence: what is wrong>
**Suggested fix:** <one sentence: what it should say instead>
**Status:** OPEN
**Discovered:** <ISO timestamp>
**Session:** <session_id if applicable, else "ad-hoc">
---
```

If `doc-drift-issues.md` already exists, append **below** the last entry — never overwrite existing entries.

---

## Stage 4 — Report

After logging, print a summary to the chat:

```
## Doc Drift Audit — <date>

Session: <session_id or "ad-hoc">
Issues found: <N>

| # | File | Issue Type | Description |
|---|---|---|---|
| 1 | <file> | <type> | <description> |
...

All issues logged to fixtures/research/doc-drift-issues.md.
Run the doc-drift-fix skill to apply fixes to main.
```

If zero issues are found, print:
> ✅ No doc drift detected. All skill documentation matches the current codebase state.
