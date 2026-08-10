# System Audit: Graph Edges and Inferred Relationships
Date: 2026-08-10

## Goal
To solve limitations in the pure AST parser by explicitly capturing relational source and target identities, and by probabilistically classifying relationship confidence.

## Gaps Identified
1. **The Graph Edge Problem**: `StructuralEntity` was flat, lacking explicit pointers between nodes, making it difficult to construct a valid graph without fuzzy matching.
2. **The Path & Module Resolution Problem**: Target files from imports were treated as literals rather than physical, canonical file references.
3. **The Pure AST Parsing Limit**: We lacked the ability to track method calls to their definitions across files because we don't have a full TypeScript type-checker, leading to missing relationships for deep method calls.

## Outcomes
1. **Explicit Graph Edges**: Added `sourceId` and `targetId` to `StructuralEntity` to formalize directional edges.
2. **Path Resolver**: Created `pathResolver.ts` to map import literals to canonical, repository-relative file paths, which allows deterministic generation of target entity IDs.
3. **Categorical Inferred Relationships**: 
   - Enhanced `EvidenceRecord` to store an array of evidences (e.g. `syntax-call`, `import-match`, `target-signature`).
   - Introduced `status` (`DETERMINISTIC` vs `INFERRED`) and `confidence` (`HIGH`, `MEDIUM`, `LOW`) for classification.
   - Modified `relationshipVisitor.ts` to track un-typechecked method calls and dynamically scan the target AST to verify export signatures, assigning confidence probabilistically based on the corroboration of evidence.
