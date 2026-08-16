# Research Methodology Reconstruction (2026-08-16)

## The Core Problem
The previous research process measured success using **primitive count deltas** (e.g. "We went from 100 contracts to 508 contracts"). This led to an illusion of progress while structural soundness decayed. Analysis revealed that of those 508 contracts, 32% were phantom routes, 40% were from test files, 89% of relationships had no `targetId`, and `entityType` was `undefined` on every single primitive.

The research loop was using AI to reason about a broken graph, leading to hallucinations and inaccurate gap reporting.

## The Fix
This rewrite completely restructures the research loop to prioritize **structural health over volume**. The new mental model is strict:
1. **Phase 1: CORRECTNESS** — Does the extractor produce structurally valid output against controlled fixtures?
2. **Phase 2: COMPLETENESS** — Does the extractor capture what matters for real repos, passing health metrics?
3. **Phase 3: REASONING** — Does the representation enable AI to reason about the system?

## Key Changes
- Added `entity_type` and `scope` to the core schema to eliminate undefined ambiguity and filter out `TEST` code.
- Replaced the primary testbed (`express`) with `layered-app` (TypeScript), matching the actual SR use case.
- Introduced `chomp health` CLI to gate research: connectivity rate, entity type coverage, parent coverage, and scope purity must pass before AI analysis is permitted.
- Deprecated all 17 prior `express` research sessions, keeping them for historical audit only.
- Replaced the `parser-eval-harness` skill with `fixture-builder` to enforce correctness via deterministic `expected.json` ground truths.
