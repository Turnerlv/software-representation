# Cloned Repositories

This directory contains real-world repositories cloned for research and extraction evaluation.
**Do not commit the contents of these repositories to the chomp monorepo.** They are git-ignored.

## Storage Strategy

When `chomp research start --repo <name>` is executed, the CLI runs an extraction and saves the resulting graph in two places:
1. **Isolated Repo DB (`fixtures/cloned-repos/<name>.db`)**: A snapshot of the extraction specifically for this repository. This allows you to inspect extraction results offline without touching the main application state.
2. **Central DB (`apps/backend/data/chomp.db`)**: This powers the live explorer application for interactive viewing.

## Using the CLI

Do not analyze repositories manually. Use the deterministic research loop.

1. **Start a research loop:**
```bash
pnpm chomp research start --repo <name>
```
*This validates structural health metrics, creates an `analysis/` branch, performs the extraction to `.db` files, and prepares the AI handoff.*

2. **Close the loop:**
```bash
pnpm chomp research close --repo <name>
```
*This automatically calls the AI Oracle, writes the deep analysis report to `fixtures/research/analysis`, registers the session, and merges the branch.*

## Manual Ad-hoc Analysis

If you just need to update the database without running a full research loop, use `analyze`:

```bash
pnpm chomp analyze fixtures/cloned-repos/<name>
```
*Note: This defaults to writing only to the isolated `fixtures/cloned-repos/<name>.db` file. Pass `--db apps/backend/data/chomp.db` if you want it to appear in the web UI.*
