---
**File:** `.agents/skills/parser-eval-harness/SKILL.md`
**Line(s):** 153
**Issue type:** wrong-command
**Description:** Command `chomp ledger` is missing `TSX_DISABLE_IPC=1 pnpm` prefix.
**Suggested fix:** Change to `TSX_DISABLE_IPC=1 pnpm chomp ledger`.
**Status:** RESOLVED
**Fixed:** 2026-08-10T19:43:00Z
**Discovered:** 2026-08-10T18:46:00Z
**Session:** 2026-08-10-175537-express
---
---
**File:** `fixtures/research/sessions/2026-08-10-175537-express.md`
**Line(s):** 25, 37
**Issue type:** stale-file-ref
**Description:** Proposed fix references `packages/core/src/extractor/adapters/express/index.ts` which does not exist.
**Suggested fix:** Update path to `packages/core/src/extractor/adapters/expressAdapter.ts`.
**Status:** RESOLVED
**Fixed:** 2026-08-10T19:43:00Z
**Discovered:** 2026-08-10T18:46:00Z
**Session:** 2026-08-10-175537-express
---
---
**File:** `fixtures/research/sessions/2026-08-10-175537-express.md`
**Line(s):** 31, 38
**Issue type:** stale-file-ref
**Description:** Proposed fix references `packages/core/src/extractor/visitors/boundary.ts` which does not exist.
**Suggested fix:** Update path to `packages/core/src/extractor/visitors/boundaryVisitor.ts`.
**Status:** RESOLVED
**Fixed:** 2026-08-10T19:43:00Z
**Discovered:** 2026-08-10T18:46:00Z
**Session:** 2026-08-10-175537-express
---
---
**File:** `.agents/skills/parser-eval-harness/SKILL.md`
**Line(s):** 26
**Issue type:** missing-note
**Description:** The table of currently extracted BOUNDARY patterns is missing CommonJS module exports.
**Suggested fix:** Add CommonJS module exports to the BOUNDARY row.
**Status:** RESOLVED
**Fixed:** 2026-08-10T19:43:00Z
**Discovered:** 2026-08-10T18:46:00Z
**Session:** 2026-08-10-175537-express
---

---
**File:** `.agents/skills/parser-eval-harness/SKILL.md`
**Line(s):** 83
**Issue type:** stale-checklist
**Description:** EventEmitter.on('eventName', handler) is not marked as handled but is now parsed by eventEmitterVisitor.ts.
**Suggested fix:** Mark it with ✅ and mention eventEmitterVisitor.ts.
**Status:** RESOLVED
**Fixed:** 2026-08-10T19:43:00Z
**Discovered:** 2026-08-10T11:16:56.741Z
**Session:** 2026-08-10-184852-express
---
