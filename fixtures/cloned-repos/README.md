# Cloned Repositories

This directory contains real-world repositories cloned for research and extraction evaluation.
**Do not commit the contents of these repositories to the chomp monorepo.** They are explicitly git-ignored.

## Storage Strategy

As of the v3 architecture, the old `.db` per-repository pattern is deprecated. All local extraction results are written to a single unified SQLite database located at `~/.chomp/chomp.db`.

## Using the CLI

Do not analyze repositories manually using ad-hoc commands for research. Use the deterministic research loop provided by the internal `chomp-research` CLI.

1. **Start a research session:**
```bash
pnpm chomp-research session open --repo <name>
```

2. **Close the session:**
```bash
pnpm chomp-research session close --repo <name>
```

3. **Log missing patterns or bugs:**
```bash
pnpm chomp-research ledger pattern log
pnpm chomp-research ledger bug log
```

## Manual Ad-hoc Analysis

If you just need to extract the graph to the local database without running a full research loop (e.g. for testing the public CLI), use `chomp`:

```bash
pnpm chomp analyze fixtures/cloned-repos/<name>
```
*Note: This writes directly to `~/.chomp/chomp.db`.*
