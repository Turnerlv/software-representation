---
name: research-loop
description: Orchestrates a research session against a cloned repository, gating AI analysis behind strict structural health metrics.
---

# `research-loop` Skill

This skill orchestrates a research session against a target repository. It enforces the new health-metric-first methodology.

> **CRITICAL**: The Oracle (AI analysis) must **NOT** be invoked unless the repository passes all structural health metrics. If health metrics fail, the graph is structurally unsound and AI will hallucinate.

## Prerequisites

Before invoking this skill, ensure:
1. The target repo exists in `fixtures/research/registry.json`.
2. The repo is cloned at `fixtures/cloned-repos/<repo-name>`.

## Stage 1 — Structural Health Check

1. Run the `chomp health` command against the target repo:
   ```bash
   pnpm chomp health --repo fixtures/cloned-repos/<repo-name>
   ```

2. **STOP AND REVIEW:**
   - Did the health check pass?
   - **If PASS:** Proceed to Stage 2.
   - **If FAIL:** Stop. The structural representation is incomplete. Do NOT run AI analysis.
     - You must build new controlled fixtures for the missing structural patterns using `fixture-builder`.
     - Implement the fixes in `packages/core` to make the new fixtures pass.
     - Repeat Stage 1 until `chomp health` passes.

## Stage 2 — Deep AI Analysis (The Oracle)

*Only proceed here if `chomp health` passed all metrics.*

1. Run the `deep-analysis` skill to have the Oracle reason about the structurally sound graph.
2. The output will be saved in `fixtures/research/analysis/`.

## Stage 3 — Audit & Record

1. Summarize any key insights or findings from the Oracle in a session report.
2. If necessary, invoke `system-audit` or `doc-drift-audit` based on changes made during the fixes.
