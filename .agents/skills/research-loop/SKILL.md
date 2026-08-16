---
name: research-loop
description: Orchestrates a full research session against a cloned repository with human checkpoints, tracking results in registry.json.
---

# `research-loop` Skill

This skill orchestrates a complete research session against a target repository. It tracks session state in `fixtures/research/registry.json` and produces a session report at `fixtures/research/sessions/<session_id>.md` that ties every code change back to the evidence that motivated it.

> **CRITICAL**: This skill is the **only** entry point for starting a new research session. Ad-hoc runs against cloned repos are discouraged.

---

## Operational Warnings

- **Do NOT pipe `chomp analyze` output** (e.g., `| tail`). Doing so can cause `EPIPE` errors and prevent the DB from saving successfully.
- **Always use `pnpm chomp`**. The `chomp` command is mapped in `package.json`. Do NOT try to run `tsx` directly or use `pnpm cli analyze`.
- **Always use the `--db` flag** when running `chomp analyze` or `chomp ledger`. Omitting `--db` will cause the DB to be saved to the default path `apps/backend/data/chomp.db` instead of the target repo folder.

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

1. **Create Checklist Artifact:** Create a `task.md` Artifact (or a local `scratch/checklist.md`) with a checklist of the stages in this session. You must check off `[x]` items sequentially as you complete each stage to ground your execution state.

2. Run the session start command. This handles version checking, DB generation/re-use, branch creation, registry updating, session report stub creation, and git committing automatically.

   ```bash
   TSX_DISABLE_IPC=1 pnpm chomp session start --repo <repo-name>
   ```
   
   > **Note:** If this errors because a complete session already exists for this extractor version, you may append `--force` if the human explicitly wants to override.

3. Read the newly generated session report at `fixtures/research/sessions/<session_id>.md` (which the CLI created) to get the baseline counts.

4. **Print to chat** — immediately after setup, output the following so the human can confirm the baseline before gap analysis begins:

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

1. Prepare the Oracle handoff payload using the CLI:
   ```bash
   TSX_DISABLE_IPC=1 pnpm chomp audit prepare --repo <repo-name>
   ```
   *Note: This creates the handoff directory at `fixtures/research/handoffs/<repo-name>-<date>` with `current_extraction.json`.*

2. Run the Studio Bridge to query the Oracle (Gemini 1.5 Pro) about missing structural facts or required metadata evolutions:
   ```bash
   TSX_DISABLE_IPC=1 tsx packages/cli/src/bridge.ts <repo-name>-<date>
   ```

3. Import the Oracle's discovery notes back into the local SQLite ledger:
   ```bash
   TSX_DISABLE_IPC=1 pnpm chomp ledger import --file fixtures/research/handoffs/<repo-name>-<date>/studio_output.json --repo <repo-name>
   ```

4. Display the updated ledger to the human:
   ```bash
   TSX_DISABLE_IPC=1 pnpm chomp ledger
   ```

5. Run the log-gaps command to automatically record the gap count in `registry.json` and commit the updated session report:
   ```bash
   TSX_DISABLE_IPC=1 pnpm chomp session log-gaps --repo <repo-name> --count <n>
   ```

6. **🛑 PRINT TO CHAT — do this before asking anything.** Output the newly discovered gaps and evolutions from the ledger. The human must be able to review and decide without opening any file.

   Then ask:
   > "Gap analysis complete. Review the discoveries above. Proceed to build fixes/evolutions? (yes / skip / abort)"
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

1. Re-run `chomp analyze` to inspect the delta. You can use the CLI or SQLite to check the numbers.
2. Append the outcome section to the session report file (`fixtures/research/sessions/<session_id>.md`):

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

3. **Reconcile Session Report File Paths:** Check the `## Gaps Discovered` and `## Build Plan` sections in `fixtures/research/sessions/<session_id>.md`. If the actual file created/modified during Stage 2 differs from the initial proposed path (e.g., `expressAdapter.ts` instead of `adapters/express/index.ts`), update those lines to reflect the exact target file path.

4. **Proactively Sync Parser Harness Documentation:** Update `.agents/skills/parser-eval-harness/SKILL.md`:
   - In Section 1 (**What the Extractor Already Handles**), add any newly extracted AST patterns to the corresponding primitive row in the table.
   - In Section 3 (**Pattern Checklist**), update the item for each resolved pattern to mark it with `✅ **Already handled by `<visitor/adapter filename>`**`.

5. Run the session close command to automatically re-analyze the graph, record the final entity counts, mark the session as `COMPLETE`, and commit the changes:
   ```bash
   TSX_DISABLE_IPC=1 pnpm chomp session close --repo <repo-name> --resolved <n>
   ```

6. **🛑 PRINT TO CHAT — output the full Outcome section and Resolution Summary verbatim before asking anything.** The human must see the delta table and every resolved/deferred gap in the conversation without opening the session file.

   Then ask:
   > "Session complete. How would you like to close this branch?"
   > - `merge` — push branch to remote (for backup), then merge into `main` locally with `--no-ff`
   > - `pr` — push branch to remote and stop; open a GitHub PR manually
   > - `skip` — do nothing; branch stays local

7. If `merge`:
   ```bash
   TSX_DISABLE_IPC=1 pnpm chomp session merge --repo <repo-name>
   ```
   
8. If `pr`:
   ```bash
   git push origin research/<repo-name>-<date>
   ```
   Remind the human to open a PR on GitHub with the session report path in the description.

---

## After the Session — Recommended Next Step

Once the branch is merged, pushed, or skipped, invoke the **`doc-drift-audit`** skill.

It will inspect what happened during this session — commands that needed workarounds, checklist items that are now stale, table names that were wrong — and log any issues to `fixtures/research/doc-drift-issues.md` without touching any source files.

When you have a backlog of issues to flush, invoke **`doc-drift-fix`** in a clean session to apply them all to `main`.
