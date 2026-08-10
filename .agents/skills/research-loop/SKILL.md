---
name: research-loop
description: Orchestrates a full research session against a cloned repository with human checkpoints, tracking results in registry.json.
---

# `research-loop` Skill

This skill orchestrates a complete research session against a target repository. It tracks session state in `fixtures/research/registry.json` and produces a session report at `fixtures/research/sessions/<session_id>.md` that ties every code change back to the evidence that motivated it.

> **CRITICAL**: This skill is the **only** entry point for starting a new research session. Ad-hoc runs against cloned repos are discouraged.

---

## Prerequisites

Before invoking this skill, ensure:
1. The target repo exists in `fixtures/research/registry.json`.
2. The repo is cloned at `fixtures/cloned-repos/<repo-name>`.
   - If not cloned, **stop** and provide the `clone_cmd` from `registry.json`. Wait for the human to run it before continuing.

## Session Recovery

If a session with `status: "IN_PROGRESS"` already exists for today in `registry.json`, check whether a session report file exists at its `report_path`. Resume from the last completed stage rather than restarting.

---

## Stage 0 — Session Setup (Automated)

1. Read `<repo-name>`, `pinned_commit`, and `extractor_version` (from `packages/core/package.json`) from `registry.json`.

2. **Guard: prior COMPLETE session with same extractor version.**
   Read the current `extractor_version` from `packages/core/package.json`. Then find the most recent session in `registry.json` for this repo whose `status` is `COMPLETE` **and** whose `extractor_version` matches the current version.

   If such a session exists, print:
   > ⚠️ A completed session (`<session_id>`) already ran against this repo with extractor v`<version>`. Running again is likely to produce identical results unless the source files have changed.
   > Continue anyway? (yes / abort)
   - `abort` → exit without any changes.
   - `yes` → continue.

   > **Note:** `pinned_commit` is a repo-level field shared by all sessions, so it is not used as a differentiator here. The meaningful signal of redundant work is an identical `extractor_version` on a prior COMPLETE session.

3. **Freshness check: does analyze need to re-run?**

   Determine the current extractor version from `packages/core/package.json`. Then find the most recent session for this repo (any status).

   The DB is considered **fresh** if **all three** of the following are true:
   - `fixtures/cloned-repos/<repo-name>.db` exists.
   - The DB file's modification time is **newer** than the most recent session's `date`.
   - The most recent session's `extractor_version` matches the current version from `packages/core/package.json`.

   **If the DB is fresh** — skip re-analysis. Print:
   > ✅ DB is up-to-date (extractor v<version>, last run after <last_session_date>). Reusing existing extraction results.

   **If the DB is stale or missing** — delete and re-run:
   ```bash
   rm -f fixtures/cloned-repos/<repo-name>.db
   TSX_DISABLE_IPC=1 pnpm chomp analyze fixtures/cloned-repos/<repo-name> --db fixtures/cloned-repos/<repo-name>.db
   ```
   > **Note:** `TSX_DISABLE_IPC=1` is required to prevent an EPERM error from tsx's IPC pipe on macOS. Always include it.
   > 
   > **Operational Warnings:**
   > - **Do NOT pipe** the output of `chomp analyze` (e.g., `| tail`). Doing so can cause an `EPIPE` error which silently aborts the SQLite transaction, leaving the DB un-updated.
   > - `pnpm chomp` is explicitly mapped in `package.json`. Do not try to run `npx tsx`, `pnpm cli`, or other variants if `pnpm chomp` appears to fail initially.
   > - The `--db` flag is mandatory. If omitted, the DB will save to a fallback path (`apps/backend/data/chomp.db`) instead of the targeted fixtures directory.

4. Create a new session entry in `registry.json`:
   ```json
   {
     "session_id": "<YYYY-MM-DD-HHMMSS>-<repo-name>",
     "branch": "research/<repo-name>-<YYYY-MM-DD-HHMMSS>",
     "date": "<today ISO date>",
     "extractor_version": "<packages/core version>",
     "report_path": "fixtures/research/sessions/<YYYY-MM-DD-HHMMSS>-<repo-name>.md",
     "entity_counts": {
       "before": { "BOUNDARY": 0, "CONTRACT": 0, "RELATIONSHIP": 0, "OPEN_CONNECTOR": 0 },
       "after":  { "BOUNDARY": 0, "CONTRACT": 0, "RELATIONSHIP": 0, "OPEN_CONNECTOR": 0 }
     },
     "gaps_logged": 0,
     "gaps_resolved": 0,
     "status": "IN_PROGRESS"
   }
   ```

5. Create and checkout a git branch: `research/<repo-name>-<YYYY-MM-DD-HHMMSS>`

6. Record the **before** entity counts from the analyze output (or the reused DB) into the session entry in `registry.json`.
7. Create the session report file at `fixtures/research/sessions/<session_id>.md`. Use this template for the header:

   ```markdown
   # Research Session: <repo-name> — <YYYY-MM-DD-HHMMSS>

   ## Target
   - Repo: <url>
   - Pinned commit: <short SHA>
   - Extractor version: <version>
   - Branch: research/<repo-name>-<YYYY-MM-DD-HHMMSS>

   ## Extraction Baseline
   | Primitive      | Count |
   |---|---|
   | BOUNDARY       | <n>   |
   | CONTRACT       | <n>   |
   | RELATIONSHIP   | <n>   |
   | OPEN_CONNECTOR | <n>   |

   ---
   <!-- Stage 1 content will be appended below -->
   ```

8. Commit both `registry.json` and the session report stub to the branch:
   `research(<repo-name>): session <session_id> — setup`

9. **Print to chat** — immediately after setup, output the following so the human can confirm the baseline before gap analysis begins:

   > **Session `<session_id>` — Setup Complete**
   > Branch: `research/<repo-name>-<YYYY-MM-DD-HHMMSS>`
   >
   > | Primitive | Before |
   > |---|---|
   > | BOUNDARY | `<n>` |
   > | CONTRACT | `<n>` |
   > | RELATIONSHIP | `<n>` |
   > | OPEN_CONNECTOR | `<n>` |
   >
   > Proceeding to gap analysis...

---

## Stage 1 — Gap Analysis 🛑 HUMAN GATE

1. Invoke the `parser-eval-harness` skill against the cloned repo. The eval harness logs gaps into the ledger.
2. Run: `TSX_DISABLE_IPC=1 pnpm chomp ledger --db fixtures/cloned-repos/<repo-name>.db`
   > **DB table reference:** Entity counts live in `structural_entities`. If you ever need a raw count query, use:
   > `sqlite3 fixtures/cloned-repos/<repo-name>.db "SELECT type, count(*) FROM structural_entities GROUP BY type;"`
3. **Produce a Research Brief** and append it to the session report. The brief must include:

   ```markdown
   ## Gaps Discovered

   ### [<IMPACT>] <patternName>
   - **Evidence:** `<evidenceFile>:<evidenceLine>` — `<evidenceSnippet>`
   - **Missing primitive:** <BOUNDARY | CONTRACT | RELATIONSHIP | OPEN_CONNECTOR>
   - **Proposed fix:** `<fixLocation>`
   - **Rationale:** <one sentence explaining why this pattern is structurally significant>

   <!-- Repeat for each gap -->

   ## Build Plan
   | Gap | Impact | Decision | Target File |
   |---|---|---|---|
   | <patternName> | HIGH | ✅ Build | <adapter/visitor file> |
   | <patternName> | MEDIUM | ✅ Build | <adapter/visitor file> |
   | <patternName> | LOW | ⏭ Defer | — |

   ---
   🛑 **HUMAN GATE — Stage 1:** Review the build plan above before any parser changes are made.
   ```

4. Commit the updated session report to the branch:
   `research(<repo-name>): session <session_id> — gap analysis complete`

5. Update `gaps_logged` in `registry.json` with the total count of DISCOVERED gaps.

6. **🛑 PRINT TO CHAT — do this before asking anything.** Output the entire Research Brief verbatim in the chat. This means every gap entry and the full Build Plan table must appear in the conversation. Do not summarize. Do not say "see the session file". The human must be able to review and decide without opening any file.

   Then ask:
   > "Gap analysis complete. Review the build plan above. Proceed to build fixes? (yes / skip / abort)"
   - `yes` → continue to Stage 2
   - `skip` → mark session `COMPLETE`, commit `registry.json`, push branch, exit
   - `abort` → exit without committing further

---

## Stage 2 — Build Fixes (Per Gap) 🛑 HUMAN GATE (per gap)

For each `HIGH` or `MEDIUM` gap in the ledger (status = `DISCOVERED`), in order of impact:

1. **Print to chat** — output the full gap entry before asking:
   ```
   ### [<IMPACT>] <patternName>
   - Evidence: <file>:<line> — <snippet>
   - Missing primitive: <type>
   - Proposed fix: <file>
   - Rationale: <sentence>
   ```
2. **STOP and ask:**
   > "Build fix for '<patternName>'? (yes / skip)"
3. If `yes`:
   - Invoke the `parser-builder` skill for that specific gap.
   - Run `pnpm test --filter @chomp/core` immediately after.
   - If tests fail: surface the failure and ask the human how to proceed before moving to the next gap.
4. Append the outcome to the Build Plan table in the session report (✅ Built / ⏭ Skipped / ❌ Failed).

After all gaps are processed:

5. **STOP and ask:**
   > "All fixes attempted. Ready to run final confirmation? (yes / abort)"

---

## Stage 3 — Confirm & Record 🛑 HUMAN GATE

1. Delete the DB and re-run extraction fresh:
   ```bash
   rm -f fixtures/cloned-repos/<repo-name>.db
   TSX_DISABLE_IPC=1 pnpm chomp analyze fixtures/cloned-repos/<repo-name> --db fixtures/cloned-repos/<repo-name>.db
   ```
2. Run: `TSX_DISABLE_IPC=1 pnpm chomp ledger --db fixtures/cloned-repos/<repo-name>.db`
3. Record the **after** entity counts into the session entry in `registry.json`.
4. Append the outcome section to the session report:

   ```markdown
   ## Outcome

   | Primitive      | Before | After | Delta |
   |---|---|---|---|
   | BOUNDARY       | <n>    | <n>   | +<n>  |
   | CONTRACT       | <n>    | <n>   | +<n>  |
   | RELATIONSHIP   | <n>    | <n>   | +<n>  |
   | OPEN_CONNECTOR | <n>    | <n>   | +<n>  |

   ## Resolution Summary
   | Gap | Result | Notes |
   |---|---|---|
   | <patternName> | ✅ Resolved | <visitor/adapter created> |
   | <patternName> | ⏭ Deferred | <reason> |

   ## Session Notes
   <Agent fills in edge cases, surprises, deferred decisions, or patterns worth investigating next session>
   ```

5. **Reconcile Session Report File Paths:** Check the `## Gaps Discovered` and `## Build Plan` sections in `fixtures/research/sessions/<session_id>.md`. If the actual file created/modified during Stage 2 differs from the initial proposed path (e.g., `expressAdapter.ts` instead of `adapters/express/index.ts`), update those lines to reflect the exact target file path.

6. **Proactively Sync Parser Harness Documentation:** Update `.agents/skills/parser-eval-harness/SKILL.md`:
   - In Section 1 (**What the Extractor Already Handles**), add any newly extracted AST patterns to the corresponding primitive row in the table.
   - In Section 3 (**Pattern Checklist**), update the item for each resolved pattern to mark it with `✅ **Already handled by `<visitor/adapter filename>`**`.

7. Update `registry.json`:
   - Set `entity_counts.after`
   - Set `gaps_resolved` count
   - Set `status: "COMPLETE"`

8. Commit everything — session report + `registry.json` — with message:
   `research(<repo-name>): session <session_id> complete — see fixtures/research/sessions/<session_id>.md`

9. **🛑 PRINT TO CHAT — output the full Outcome section and Resolution Summary verbatim before asking anything.** The human must see the delta table and every resolved/deferred gap in the conversation without opening the session file.

   Then ask:
   > "Session complete. How would you like to close this branch?"
   > - `merge` — push branch to remote (for backup), then merge into `main` locally with `--no-ff`
   > - `pr` — push branch to remote and stop; open a GitHub PR manually
   > - `skip` — do nothing; branch stays local

10. If `merge`:
   ```bash
   git push origin research/<repo-name>-<date>
   git checkout main
   git merge --no-ff research/<repo-name>-<date> -m "research(<repo-name>): merge session <session_id>"
   ```

   **After the merge, bump the extractor version** — but only if the session produced a real delta (i.e., `gaps_resolved > 0` and at least one primitive count increased). This keeps the version number meaningful for the Stage 0 guard.

   ```bash
   npm version patch --no-git-tag-version --prefix packages/core
   ```

   Then commit the bump to `main`:
   ```bash
   git add packages/core/package.json
   git commit -m "chore: bump @chomp/core to <new-version> — <session_id> (<N> gaps resolved)"
   ```

   If no gaps were resolved (`gaps_resolved = 0` and `after == before` for all primitives), **skip the version bump** and print:
   > ℹ️ No extractor changes landed this session — version left at `<current-version>`.
11. If `pr`:
   ```bash
   git push origin research/<repo-name>-<date>
   ```
   Remind the human to open a PR on GitHub with the session report path in the description.

---

## After the Session — Recommended Next Step

Once the branch is merged, pushed, or skipped, invoke the **`doc-drift-audit`** skill.

It will inspect what happened during this session — commands that needed workarounds, checklist items that are now stale, table names that were wrong — and log any issues to `fixtures/research/doc-drift-issues.md` without touching any source files.

When you have a backlog of issues to flush, invoke **`doc-drift-fix`** in a clean session to apply them all to `main`.
