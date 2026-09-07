# Incremental Extraction Architecture
> **STATUS: PHASE 2 (Post-MVP)** 
> *Note: Phase 1 relies on brute-force `git archive HEAD` extraction to guarantee 100% mathematical accuracy without AST dependency invalidation risks.*

## The Problem
Running `chomp analyze` or `chomp diff` on a large monorepo (e.g., 5000+ files) forces a complete AST traversal. For diffing against `HEAD`, the brute-force method relies on `git archive`, dumping thousands of files to `/tmp` and parsing them all over again. This consumes unacceptable disk I/O and compute time for minor dirty changes.

## The Solution: Delta Graph Patching
Instead of parsing the universe twice, Chomp leverages Git's internal diff engine.

1. **The Anchor Graph**: The SQLite database `.chomp/graph.db` stores the complete parsed `RepresentationGraph` for the current `HEAD` commit.
2. **Git Diff**: When `chomp diff` is invoked, it queries `git diff HEAD --name-only` and `git ls-files --others --exclude-standard` to get the strict list of modified, added, and deleted files.
3. **Patch Extraction**: `@chomp/core` exposes `analyzeFiles(filePaths)`, which parses **only** the dirty files.
4. **Graph Subtraction (DB-Backed)**: Rather than deep-cloning a 50,000-edge graph in memory, we query the SQLite Anchor Graph and *only* load the affected subgraph into memory. We programmatically strip out nodes/edges matching the dirty file paths.
5. **Graph Addition**: We append the newly parsed nodes and edges from step 3 to the working subgraph.
6. **Delta Calculation**: We pass the localized subgraphs into `compareGraphs(anchor, dirty)`.

## CLI UX & Bootup
For this architecture to work seamlessly, `.chomp/graph.db` must always have the current `HEAD` graph cached. 
To guarantee this, we will introduce a `chomp init` bootup experience.
When a user initializes Chomp in a repo, the CLI will ask:
> "Would you like to install a git post-commit hook? This keeps your local graph instantly synced and makes 'chomp diff' lightening fast."
If yes, a simple `.git/hooks/post-commit` script is installed that runs `chomp analyze --silent`.
