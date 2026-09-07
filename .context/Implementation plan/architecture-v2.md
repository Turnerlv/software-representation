# Chomp Architecture V2: The Singularity MVP

This document outlines the revised E2E architecture for Chomp, prioritizing the "Singularity Demo" (where an AI agent uses the Chomp MCP to build features for Chomp) and establishing a clear boundary for Phase 2 Cloud features.

## 1. Phase 1: The Local-First Singularity (MVP)

### 1.1 The Extraction Engine (Brute Force)
- **Engine**: `@chomp/core` runs full, brute-force AST extraction on the target directory (`chomp analyze .`).
- **Diffing**: `chomp diff` leverages `git archive HEAD` to a temporary directory to build a baseline, guaranteeing mathematical graph correctness without the dependency-invalidation traps of incremental AST patching.
- **ID Determinism**: Node IDs are strictly generated using a stable hash of `(filePath, type, name)` ensuring diffs accurately track structural intent across commits.

### 1.2 Storage & Concurrency
- **Database**: SQLite in `.chomp/graph.db`.
- **Concurrency**: `journal_mode = WAL` is strictly enforced. This allows the Next.js UI, the Chomp CLI, and the Antigravity MCP Server to read and write to the database simultaneously without `SQLITE_BUSY` locks.

### 1.3 The Visualizer UI (Bundled)
- **Deployment**: The `apps/web` Next.js frontend is exported statically (`next build && next export`) and bundled into the `@chomp/cli` NPM package.
- **Serving**: `chomp explore` boots a local Express server on `localhost:3000` serving the static assets and API routes. This eliminates all CORS and Mixed Content (HTTPS -> HTTP) browser security traps.

### 1.4 AI Integration & Hallucination Defense
- **The MCP Server**: A standalone local server exposing `chomp_get_nodes` and `chomp_get_edges` tools to LLM agents (like Antigravity), giving them deterministic architectural context.
- **The Cartographer**: The AI layout engine generates logical groupings (lanes) and roles.
- **Defense**: The `layout_views` table enforces strict SQLite `FOREIGN KEY` constraints against the `nodes` table. If the Cartographer attempts to hallucinate a node ID to satisfy a layout, the database rejects the transaction.

---

## 2. Phase 2: The SaaS Strategy & Cross-Repo Stitching (Post-MVP)

The cloud strategy remains a highly lucrative Phase 2, shifting focus from "individual repo views" to "enterprise architectural intelligence".

### 2.1 The Database Accelerator: Turso
- Instead of Postgres/Supabase, the cloud backend will use **Turso** (libSQL).
- Because the local CLI engine already uses SQLite, Turso provides 100% database parity.
- We will leverage Turso's Embedded Replicas to seamlessly sync the local `.chomp/graph.db` to the cloud, halving Cloud Sync development time.

### 2.2 Cross-Repo Stitching & Semantic Signatures
- The billion-dollar feature: linking `OPEN_CONNECTOR` nodes across microservices.
- To ensure cross-repo stitching succeeds, the AST extractor will capture deterministic routing signatures in the `metadata` payload (e.g., `[POST] /api/v1/billing/charge`).
- If Repo A has an OPEN_CONNECTOR `fetch('/api/v1/billing/charge')`, and Repo B has a CONTRACT `[POST] /api/v1/billing/charge`, the Cloud stitching engine can instantly map them via a simple SQL JOIN.

### 2.3 The Viral Growth Loop (GitHub App)
- Users link Chomp to their GitHub organization for free user acquisition via a Product-Led Growth (PLG) loop.
- A GitHub App automatically runs `chomp analyze` on Pull Requests and posts an Architectural PR Comment: *"📊 Chomp detected an architectural change: You added an Open Connector to stripe.com."*
- Unexposed developers click the visual transit map link, realize its value, and run `npm install -g chomp` locally.

### 2.4 Agentic Enterprise Querying
- Paid tiers offer specialized Cloud MCPs or chat interfaces where teams can query the stitched architecture: *"Which internal services will break if we deprecate the v1 User API in the monolith?"*
