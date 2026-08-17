# Rewrite: v4 Research Methodology & Data Model
Date: 2026-08-17

## Objective
Migrate from the manual AI Studio handoff workflow (v3) to a fully deterministic, CLI-driven Phase 1 loop (v4) with explicit separation of coverage gaps from correctness bugs.

## What Changed

### 1. Data Model Split
The old unified `chomp_ledger.db` (which conflated missing patterns and incorrect parsing) has been split into two strict stores:
- **Pattern Ledger** (`fixtures/research/pattern_ledger.db`): One row per pattern class (e.g., `export.cjs-property-assignment`). Tracks coverage gaps where the extractor doesn't yet know the syntactic shape. Supports `detection_signature` (regex) for deterministic sweeping.
- **Bug Tracker** (`fixtures/research/bug_tracker.db`): One row per defect (e.g., duplicate evidence record). Tracks correctness bugs in already-handled patterns.

### 2. Deterministic Phase 1 (`chomp inventory`)
Replaced the AI-driven "find all gaps" approach with a deterministic Phase 1:
- `chomp inventory --repo <name>` uses `ripgrep` to sweep the target repo against all known pattern signatures in the Pattern Ledger.
- It updates occurrence counts and flags unhandled patterns that are actually present in the codebase.
- Operates entirely without LLMs and enforces a structural health gate before running.

### 3. V4 Session Types
Research sessions are now strictly typed via `chomp session start --type <inventory|comparison|fix>`:
- **Inventory (`research/inventory/*`)**: Deterministic ripgrep sweep.
- **Comparison (`research/compare/*`)**: Rubric-driven AI session targeting specific files to find new pattern classes or bugs. Logged immediately via CLI (no markdown summaries).
- **Fix (`fix/*`)**: Extractor modification. Enforces `chomp health` and `pnpm test --filter @chomp/core` passing before `chomp session merge` will succeed.

### 4. Dead Code Removal
Deleted the entire legacy bridge and manual AI studio workflow:
- `packages/cli/src/bridge.ts` and `bridge-analysis.ts`
- `packages/cli/src/commands/research.ts` (`chomp research start/close`)
- `chomp audit prepare` (the JSON snapshot exporter for AI Studio)

### 5. Documentation
- Rewrote `README.md` to reflect the v4 flow.
- Rewrote `AGENTS.md` with updated architectural bounds, the 3+1 ontology clarification, and agent rules.
- Updated `.agents/skills/research-loop/SKILL.md` to orchestrate the 3-session-type loop.

## Impact
The system now has a reliable, mathematically rigorous denominator for coverage. By scanning for known patterns deterministically in Phase 1, AI comparison in Phase 2 can focus purely on finding *new* gaps rather than counting known ones.
