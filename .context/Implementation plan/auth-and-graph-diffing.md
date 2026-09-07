# Auth & Graph Diffing Strategy

**Status:** Draft / Conceptual
**Scope:** Macro Product Strategy, Supabase Backend, Local DX, UI Design System

---

## 1. Authentication & Security (Supabase)

To support seamless transitions between local development, CI/CD, and the Cloud SaaS, Chomp utilizes Supabase (Postgres + GoTrue) spanning three environments:

### 1.1 Multi-Environment Auth Strategy
* **Web Visualizer (Cloud):** 
  * Uses **GitHub OAuth** via `@supabase/ssr` in the Next.js App Router. 
  * Authenticating via GitHub maps user identities directly to the repositories and organizations they own, simplifying project onboarding.
* **Local CLI (`chomp login`):**
  * Developers authenticate their local terminal using **Personal Access Tokens (PATs)**. 
  * Tokens are generated in the Cloud Web UI and saved locally (e.g., `~/.chomp/credentials.json`). 
  * This allows the local MCP to securely pull "Draft Intents" (`chomp pull-intent`) or push manual overrides.
* **CI/CD & Cloud Extraction (GitHub App):**
  * To maintain the Cloud as the source of truth, Chomp will act as a **GitHub App**. 
  * Upon installation, GitHub grants an installation token. Supabase Edge Functions or background workers use this token to automatically run `chomp analyze` whenever code is pushed to remote branches.

### 1.2 Data Security (Row Level Security - RLS)
Supabase Postgres RLS policies enforce hard multi-tenant boundaries. 
* Every structural entity (`nodes`, `edges`, `evidence_records`, `layout_views`) must carry a `project_id`.
* RLS Policies ensure that authenticated users and CLI tokens can only `SELECT` or `INSERT` graphs belonging to projects they have explicit membership in.

---

## 2. The Unified Graph Diffing Engine

A core requirement for both local AI-assisted development and Cloud architectural planning is understanding **Deltas** (what changed). Just as Git diffs text, Chomp must diff graphs.

### 2.1 Three Scenarios, One Engine
We unify "ArchDiff" into a single function—e.g., `compareGraphs(baseGraph, targetGraph)`—which powers three distinct product features:
1. **Local Working Diff:** `Dirty Working Tree` vs. `Local HEAD`. (Visualizing uncommitted code an AI agent just wrote).
2. **Cloud Intent Diff:** `Lead Architect's Draft View` vs. `Main Branch Code`. (Visualizing future intent vs. current reality).
3. **PR Review Diff:** `Feature Branch` vs. `Main Branch`. (Visualizing the architectural blast radius of a pull request).

### 2.2 The `compareGraphs` Logic
Because `@chomp/core` generates deterministic, stable IDs for nodes and edges based on file paths and types, diffing is mathematically straightforward:
* **Match:** Node/Edge ID exists in both `base` and `target`. $\rightarrow$ `UNCHANGED` (or `MODIFIED` if metadata changed).
* **Missing in Base:** Node/Edge ID exists only in `target`. $\rightarrow$ `ADDED`.
* **Missing in Target:** Node/Edge ID exists only in `base`. $\rightarrow$ `REMOVED`.

---

## 3. UI Design System: "Under Construction" (Ghost Nodes)

When rendering a Graph Diff in the visualizer, the Transit Map metaphor extends beautifully to handle "Construction Zones." This allows developers to see the exact architectural impact of their uncommitted code before running `git commit`.

### 3.1 Visual Treatments
* **`ADDED` (Ghost Nodes & Wires):**
  * *Metaphor:* Planned stations / new tracks.
  * *Styling:* Glowing green outline, dashed/dotted borders, slightly pulsing opacity.
  * *Use Case:* An AI agent just created a new `/webhooks/stripe` route and wired it to a DB. The user sees this glowing green pipeline appear in the local Guest View.
* **`REMOVED` (Closed Stations & Severed Wires):**
  * *Metaphor:* Decommissioned transit stops.
  * *Styling:* Faded red hue, 30% opacity, red strikethrough across the `label_primary`.
  * *Use Case:* A developer deletes a deprecated utility module.
* **`MODIFIED` (Upgraded Stations):**
  * *Metaphor:* Station under renovation (e.g., a contract signature changed).
  * *Styling:* Amber highlight or notification dot on the node perimeter.

### 3.2 The Developer Experience (DX) Loop
1. Developer asks local AI Agent: *"Refactor the billing service to use Stripe instead of PayPal."*
2. Agent writes the code.
3. Local file watcher triggers `chomp analyze` on the dirty tree.
4. The local visualizer (Guest View) immediately updates.
5. The developer sees the PayPal nodes turn red (`REMOVED`), the Stripe nodes turn green (`ADDED`), and the routing wires shift over. 
6. The developer visually confirms the architectural intent is correct, then runs `git commit`.
