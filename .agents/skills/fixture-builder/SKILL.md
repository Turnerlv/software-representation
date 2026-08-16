---
name: fixture-builder
description: Guides the creation of new controlled fixtures and ground-truth manifests for testing extraction correctness.
---

# Fixture Builder

This skill is used to author new controlled test fixtures and their corresponding ground-truth `expected.json` manifests. This is the first step in expanding the extractor's capabilities before invoking `parser-builder`.

## 1. Create the Fixture
Create a new directory in `fixtures/test-repos/<fixture-name>`.
Add minimal TypeScript or JavaScript files that cleanly demonstrate the structural patterns you want the extractor to learn.
**Keep it minimal.** Do not add dependencies, `node_modules`, or complex runtime logic.

## 2. Define the Ground Truth
Create `fixtures/test-repos/<fixture-name>/expected.json` manually.
This file represents the exact structural state that `analyzeTarget` MUST output for this fixture.
Format:
```json
{
  "boundaries": [
    { "name": "File: app.ts", "entityType": "FILE" }
  ],
  "contracts": [],
  "relationships": [],
  "openConnectors": []
}
```

## 3. Verify the Gap
Run the correctness test suite to prove that the extractor fails to match your expected state.
`pnpm test --filter @chomp/core`

## 4. Handoff
Once the fixture fails appropriately, invoke `parser-builder` to implement the AST extraction logic that will make the fixture test pass.
