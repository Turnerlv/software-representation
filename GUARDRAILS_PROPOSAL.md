# Architectural Proposal: Agent Workflow Guardrails

## The Problem
Skills are declarative Markdown documents. As a research session grows long, the LLM’s context window shifts, causing it to lose attention weight on instructions from the beginning of the `SKILL.md` file. This results in dropped steps, such as missing the final state updates to `registry.json` or failing to commit session reports.

Because skills lack runtime state enforcement or programmatic control flow, we need to introduce guardrails to bridge the gap between LLM instructions and deterministic state machines.

## Proposed Solutions

### 1. Contextual Guardrails: The Checklist Artifact (Short-Term / Low Effort)
**Concept:** Externalize the agent's mental checklist into a living document in its immediate context.
* **Implementation:** Update `research-loop` Stage 0 to mandate the creation of a `task.md` Artifact (or a local `scratch/checklist.md`). The agent must check off `[x]` items sequentially as it completes each stage.
* **Why it works:** Artifacts and local reference files remain highly salient in the agent's short-term context. By forcing the agent to physically update a checklist file, we ground its execution state and prevent skipped steps.

### 2. Reactive Guardrails: CI/CD & Automated Audits (Medium Effort)
**Concept:** Shift our auditing left to catch skipped steps before a session is allowed to close.
* **Implementation:** Introduce a `chomp session audit` CLI script that validates invariants. For example: "If `registry.json` has `status: COMPLETE`, ensure a git commit exists with the proper message format."
* **Integration:** Add this as a git `pre-commit` hook or mandate in the skill that the agent runs `pnpm run session:audit` as its absolute final step. The script will explicitly error and instruct the agent to fix missing state before terminating.

### 3. Hard Guardrails: CLI-Driven Orchestration (Long-Term / High Effort)
**Concept:** Move orchestration logic out of Markdown instructions and into deterministic TypeScript CLI commands.
* **Implementation:** The agent no longer runs `git commit` or edits `registry.json` manually via file tools. Instead, it runs commands like:
  ```bash
  pnpm chomp session close --repo express --resolved 2
  ```
* **Why it works:** The CLI script atomically updates `registry.json`, amends the Markdown file, and executes the git commit. The LLM acts as an *operator* of a strongly-typed CLI rather than a raw script executor. Any state mutation requiring multiple sequential side-effects is abstracted behind a single, atomic command.

## Recommended Next Steps
1. **Immediate:** Add the Checklist Artifact requirement to `research-loop/SKILL.md`.
2. **Future Architecture:** Begin designing the `chomp session` subcommands in `packages/cli` to abstract away manual JSON/Markdown/Git state mutations from the agent.
