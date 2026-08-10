---
**File:** `.agents/skills/research-loop/SKILL.md`
**Line(s):** 57
**Issue type:** missing-note
**Description:** There is no warning against piping `chomp analyze` output (e.g. `| tail`), which can cause `EPIPE` errors and prevent DB saving.
**Suggested fix:** Add a warning explicitly stating not to pipe `chomp analyze` output so it can save to the DB successfully.
**Status:** RESOLVED
**Fixed:** 2026-08-11T00:19:00+08:00
**Discovered:** 2026-08-11T00:15:00+08:00
**Session:** 2026-08-10-233800-express
---

---
**File:** `.agents/skills/research-loop/SKILL.md`
**Line(s):** 57
**Issue type:** missing-note
**Description:** There is no clarification that `pnpm chomp` is the correct command, and no warning against trying incorrect variants like `pnpm cli analyze` or `npx tsx`.
**Suggested fix:** Add a note clarifying that `pnpm chomp` is mapped in package.json and agents should not try to run tsx directly or use `pnpm cli`.
**Status:** RESOLVED
**Fixed:** 2026-08-11T00:19:00+08:00
**Discovered:** 2026-08-11T00:15:00+08:00
**Session:** 2026-08-10-233800-express
---

---
**File:** `.agents/skills/research-loop/SKILL.md`
**Line(s):** 57
**Issue type:** missing-note
**Description:** There is no explicit warning to always use the `--db` flag to avoid writing to the wrong default path.
**Suggested fix:** Add a note explicitly warning that omitting `--db` will cause the DB to be saved to `apps/backend/data/chomp.db` instead of the repo folder.
**Status:** RESOLVED
**Fixed:** 2026-08-11T00:19:00+08:00
**Discovered:** 2026-08-11T00:15:00+08:00
**Session:** 2026-08-10-233800-express
---
---
**File:** fixtures/research/sessions/2026-08-10-162739-express.md
**Line(s):** 25
**Issue type:** stale-file-ref
**Description:** Proposed fix path 'packages/core/src/extractor/visitors/expressRoute.ts' does not exist but gap is RESOLVED.
**Suggested fix:** Change to 'packages/core/src/extractor/adapters/expressAdapter.ts'
**Status:** OPEN
**Discovered:** 2026-08-10T16:56:22.397Z
**Session:** 2026-08-11-002100-express
---

---
**File:** fixtures/research/sessions/2026-08-10-162739-express.md
**Line(s):** 31
**Issue type:** stale-file-ref
**Description:** Proposed fix path 'packages/core/src/extractor/visitors/expressRouterMount.ts' does not exist but gap is RESOLVED.
**Suggested fix:** Change to 'packages/core/src/extractor/adapters/expressAdapter.ts'
**Status:** OPEN
**Discovered:** 2026-08-10T16:56:22.397Z
**Session:** 2026-08-11-002100-express
---

---
**File:** fixtures/research/sessions/2026-08-10-162739-express.md
**Line(s):** 37
**Issue type:** stale-file-ref
**Description:** Proposed fix path 'packages/core/src/extractor/visitors/commonjsRequire.ts' does not exist but gap is RESOLVED.
**Suggested fix:** Change to 'packages/core/src/extractor/visitors/relationshipVisitor.ts'
**Status:** OPEN
**Discovered:** 2026-08-10T16:56:22.397Z
**Session:** 2026-08-11-002100-express
---

---
**File:** fixtures/research/sessions/2026-08-10-171034-express.md
**Line(s):** 24
**Issue type:** stale-file-ref
**Description:** Proposed fix path 'packages/core/src/extractor/adapters/express.ts' does not exist but gap is RESOLVED.
**Suggested fix:** Change to 'packages/core/src/extractor/adapters/expressAdapter.ts'
**Status:** OPEN
**Discovered:** 2026-08-10T16:56:22.397Z
**Session:** 2026-08-11-002100-express
---

---
**File:** fixtures/research/sessions/2026-08-10-171034-express.md
**Line(s):** 30
**Issue type:** stale-file-ref
**Description:** Proposed fix path 'packages/core/src/extractor/adapters/express.ts' does not exist but gap is RESOLVED.
**Suggested fix:** Change to 'packages/core/src/extractor/adapters/expressAdapter.ts'
**Status:** OPEN
**Discovered:** 2026-08-10T16:56:22.397Z
**Session:** 2026-08-11-002100-express
---

---
**File:** fixtures/research/sessions/2026-08-10-171034-express.md
**Line(s):** 36
**Issue type:** stale-file-ref
**Description:** Proposed fix path 'packages/core/src/extractor/adapters/commonjs.ts' does not exist but gap is RESOLVED.
**Suggested fix:** Change to 'packages/core/src/extractor/visitors/commonjsExportVisitor.ts'
**Status:** OPEN
**Discovered:** 2026-08-10T16:56:22.397Z
**Session:** 2026-08-11-002100-express
---
