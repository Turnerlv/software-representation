---
name: research-loop
description: Orchestrates a research session against a cloned repository using deterministic CLI commands, gating AI analysis behind strict structural health metrics.
---

# `research-loop` Skill

This skill orchestrates a research session against a target repository. It enforces a strict, deterministic, two-step CLI process that prevents AI hallucination by ensuring graphs are structurally sound before analysis.

## Prerequisites

1. The target repo must be cloned to `fixtures/cloned-repos/<repo-name>`.
2. The target repo must be registered in `fixtures/research/registry.json`.

---

## Stage 1: Extraction & Handoff (`research start`)

Run the automated `start` command to run health checks, extract the graph, create the `analysis/` branch, and generate the handoff snapshot.

```bash
pnpm chomp research start --repo <name>
```

- **If the command FAILS (exit code > 0):** Stop. The repo failed health checks. You must fix the extraction rules (using `fixture-builder` and `parser-builder`) until `pnpm chomp health` passes.
- **If the command PASSES (exit code 0):** The CLI will print the new branch name and handoff path. Proceed to Stage 2.

---

## Stage 2: Oracle Analysis (`research close`)

Run the automated `close` command to invoke the Gemini Oracle, save the report, clean up the handoff, and merge the branch.

```bash
pnpm chomp research close --repo <name>
```

- **After completion:** The analysis report is saved to `fixtures/research/analysis/<repo>-<date>.md`.
- Read the key findings from the report and discuss any recommended architecture evolutions or extraction fixes with the user.
