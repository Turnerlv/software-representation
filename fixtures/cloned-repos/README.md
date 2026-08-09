# fixtures/cloned-repos/

This directory holds real-world open-source repositories cloned locally for extractor research runs.

## Rules

- **Never committed.** This directory is `.gitignore`d — cloned repos and their generated `.db` files must never be checked in.
- **One repo at a time.** Finish the full `analyze → eval → build → re-run → confirm` loop before starting the next.
- **Isolated databases.** Each repo gets its own `.db` file to keep results separate from the main `chomp.db`.

## Standard workflow

```bash
# 1. Clone
git clone <repo-url> fixtures/cloned-repos/<repo-name>

# 2. Analyze into isolated DB
pnpm chomp analyze fixtures/cloned-repos/<repo-name> --db fixtures/cloned-repos/<repo-name>.db

# 3. Inspect ledger
pnpm chomp ledger --db fixtures/cloned-repos/<repo-name>.db

# 4. Run gap analysis (parser-eval-harness skill)
# 5. Build fixes (parser-builder skill)
# 6. Re-run & confirm
pnpm test --filter @chomp/core
pnpm chomp analyze fixtures/cloned-repos/<repo-name> --db fixtures/cloned-repos/<repo-name>.db
pnpm chomp ledger --db fixtures/cloned-repos/<repo-name>.db
```

See `AGENTS.md` Section 9 for the full step-by-step workflow.
