# System Audit: Database Schema & Extractor Versioning / Provenance

**Date:** 2026-08-10
**Goal:** Ensure the SQLite persistence layer accurately reflects the state and provenance of the extracted representation, and resolve evidence deduplication issues.

## Identified Gaps

1. **Missing Extractor Version in DB:** 
   The `repositories` table did not store the version of `@chomp/core` that generated the graph. When loaded, `getRepresentationGraph` hardcoded `version: '1.0.0'`. If the database is shared or analyzed independently of `registry.json`, there was no way to know which extractor rules were applied.

2. **Missing Source Commit Traceability:** 
   The `repositories` table did not store a `commit_sha`. A representation must be explicitly tied to the exact state of the source code it represents to be trustworthy ("Reality Over Assumptions" rule). Without storing the commit SHA in the database, the extracted graph was detached from the specific point in time it described.

3. **Evidence Record Duplication:** 
   Because entity deduplication relied on `INSERT OR IGNORE` but `evidence_records` generation used a naive `counter++` for its primary key, multiple identical method calls in the same file inserted duplicate `import-match` and `target-signature` evidence records.

## Outcomes

- **Schema Evolution:** Modified `packages/core/src/db/schema.ts` to add `extractor_version` and `commit_sha` to the `repositories` table using `ALTER TABLE`, ensuring backward compatibility with existing databases. Added a `UNIQUE INDEX` on `evidence_records(entity_id, file_path, line_number, evidence_role)` to guarantee deduplication at the DB layer.
- **Provenance Logging:** Updated `saveRepresentationGraph` and `getRepresentationGraph` to persist and retrieve `extractorVersion` and `commitSha`, tying the database directly to the extractor version and source commit.
- **Evidence Deduplication:** Altered the `evidenceId` primary key generation to use a deterministic SHA-256 hash (`globalEntityId:filePath:lineNumber:evidenceRole`). `INSERT OR IGNORE` now correctly drops redundant evidence records when multiple identical method calls generate the exact same supporting evidence.
- **Tests Passed:** Verified schema changes against `@chomp/core` tests.
