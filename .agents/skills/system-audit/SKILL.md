---
name: system-audit
description: Reads system context, evaluates architecture against the ontology, and creates system-audit records.
---

# `system-audit` Skill

**Objective:**
Perform holistic system evaluations and architecture audits for the Chomp Software Representation Engine. Propose and document systemic architectural updates that improve the extraction, persistence, or reasoning layers.

## Workflow

When invoked, execute the following steps:

1. **Context Gathering**
   - Read `registry.json` to understand past audits and current extraction scopes.
   - Read core architectural files: `packages/core/src/types/ontology.ts`, `packages/core/src/db/schema.ts`, and core visitors.
   - Read the user's specific audit request and surrounding conversation context.

2. **Holistic Evaluation**
   - Identify gaps between the pure AST limits and the goals of the representation engine.
   - Evaluate proposed architectural solutions against the Core Philosophical Rules (Reality Over Assumptions, Knowledge Separation Triad, etc.).

3. **Execution & Documentation**
   - Start the audit using the CLI to automatically generate the branch and markdown stub:
     ```bash
     TSX_DISABLE_IPC=1 pnpm chomp audit start --topic <kebab-case-topic>
     ```
   - Create an implementation plan detailing the updates in the generated file `fixtures/research/system-audits/<date>-<topic>.md`.
   - Apply the architectural changes (e.g., ontology schema updates, database migrations, parser updates).
   - Document the exact changes made under the `## Changes` section in the markdown file.
   - Close the audit and log it to the registry:
     ```bash
     TSX_DISABLE_IPC=1 pnpm chomp audit close --topic <topic> --change "Change 1 description" --change "Change 2 description"
     ```
   - Ask the human how they would like to close this branch (merge / skip / pr).
   - If merge, run the merge command to push, merge to main, and bump the version:
     ```bash
     TSX_DISABLE_IPC=1 pnpm chomp audit merge --topic <topic>
     ```
