---
name: doc-drift-fix
description: Reads fixtures/research/doc-drift-issues.md and applies all OPEN fixes to main — one focused commit per file changed. Marks each issue RESOLVED after applying. Run after doc-drift-audit.
---

# `doc-drift-fix` Skill

This skill reads the issue backlog logged by `doc-drift-audit` and applies every `OPEN` fix directly to `main`. Each changed file gets its own commit so the history stays bisectable. After applying a fix, it marks the issue `RESOLVED` in the log.

> **CRITICAL:** Always apply fixes to `main`, never to a research branch. If you are currently on a research branch, stash any uncommitted work, checkout `main`, apply fixes, then return.

---

## Prerequisites

1. `fixtures/research/doc-drift-issues.md` exists and contains at least one entry with `**Status:** OPEN`.
2. You are on `main` (or can safely switch to it).

---

## Stage 0 — Branch Check

```bash
git branch --show-current
```

If not on `main`:
```bash
git stash
git checkout main
```

Remember to `git stash pop` and switch back after Stage 3.

---

## Stage 1 — Parse the Issue Log

Read `fixtures/research/doc-drift-issues.md`. Extract all entries where `**Status:** OPEN`.

Group them by `**File:**` — all issues in the same file will be fixed in a single edit and committed together.

Print a table of what will be fixed:

```
## Doc Drift Fix Plan

| # | File | Issue Type | Description |
|---|---|---|---|
| 1 | <file> | <type> | <description> |
...

Proceed? (yes / abort)
```

Wait for approval before making any edits.

---

## Stage 2 — Apply Fixes (Per File)

For each file group, in order:

1. Read the current file content.
2. Apply **all** open fixes for that file in a single edit. Do not make separate edits per issue — one `multi_replace_file_content` call per file.
3. After editing, verify the file reads correctly (no broken step numbers, no duplicate lines introduced).
4. Commit:
   ```bash
   git add <file>
   git commit -m "fix(docs): <short description of all changes in this file> [doc-drift-fix]"
   ```
   The commit message should name the specific issues fixed, e.g.:
   `fix(docs): add TSX_DISABLE_IPC=1 to chomp commands, mark express patterns as handled [doc-drift-fix]`

5. Update `fixtures/research/doc-drift-issues.md` — change `**Status:** OPEN` to `**Status:** RESOLVED` for each issue just fixed. Add `**Fixed:** <ISO timestamp>` on the line below.

---

## Stage 3 — Return to Previous Branch (if applicable)

If you stashed work in Stage 0:
```bash
git checkout <previous-branch>
git stash pop
```

---

## Stage 4 — Report

Print a final summary:

```
## Doc Drift Fix — Complete

Fixes applied: <N>
Commits made: <N>

| Issue | File | Status |
|---|---|---|
| <description> | <file> | ✅ Fixed |
...

fixtures/research/doc-drift-issues.md updated with RESOLVED statuses.
```

If any fix could not be applied cleanly (e.g. the target line no longer exists), log it as:

```markdown
---
**File:** `<file>`
**Issue type:** fix-failed
**Description:** Could not apply: <original description>. Reason: <why it failed>.
**Status:** NEEDS_MANUAL_REVIEW
**Attempted:** <ISO timestamp>
---
```

And continue with the remaining issues.
