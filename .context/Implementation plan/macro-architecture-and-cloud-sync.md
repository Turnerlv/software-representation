# Chomp Macro Architecture & Cloud Sync Strategy

**Status:** Draft / Conceptual
**Scope:** Macro Product Strategy, Local-to-Cloud Sync, Enterprise Stitching

---

## 1. The Core Principle: One-Way Flow of Truth

To safely transition Chomp from a passive observability tool into an active "Control Plane" for AI agents, we must enforce strict directional data flow based on the *type* of data.

* **The Code Graph (Surveyor's Truth) flows UP:** `Local/CI ──► Cloud`
  * Deterministic nodes, edges, contracts, and evidence.
  * Tied immutably to a specific Git `commit_sha`.
  * The Cloud can *never* edit these facts directly.
* **The Intent Graph (Cartographer's Design) flows DOWN:** `Cloud ──► Local MCP`
  * Semantic layouts, domain groupings, named views, and **Inferred/Draft Edges**.
  * Handled as "Architectural Intents" that developers and agents can execute against.

---

## 2. Phase 1: Local Foundation (Day 1)

* **Git Anchoring:** The local `.chomp/graph.db` uses the `repositories` table as the root. Every graph extraction must be linked to the active `commit_sha` and `branch`.
* **The "Bundled Static View" (Local UI, Local Data):** For Phase 1, the Next.js frontend is exported statically and bundled into the `@chomp/cli` package. Running `chomp explore` spins up a local Express server on `localhost:3000` to serve the UI directly. This eliminates CORS and Mixed Content (HTTPS -> HTTP) blocking traps inherent to the remote Guest View. (The SaaS Guest View is deferred to Phase 2).
  * *Privacy:* Proprietary graph data never leaves the developer's laptop.
  * *DX & Upsell:* The developer gets the premium SaaS UI immediately. If not logged in, they are gently prompted to create an account to save their views. If logged in, the UI contextualizes their local work within their broader cloud organization.

---

## 3. Phase 2: Cloud Sync & The Source of Truth

The Chomp Cloud acts as the centralized system-of-systems.

* **GitHub/GitLab Integration (CI/CD):** The primary source of truth for the Cloud is not developer laptops, but the central Git remote. A GitHub Action/App runs `chomp analyze && chomp push` on every push to `main` or active PRs.
* **Historical Tracking:** The cloud stores graph snapshots over time, enabling "Architectural Diffs" (e.g., "Show me how the graph changed in this Pull Request").

---

## 4. Phase 3: "Draft Commits" & Executable Architecture

* **The Architectural Diff (ArchDiff):** A Lead Architect can use the Cloud Visualizer to draw a new edge (e.g., "Checkout Service -> Kafka"). This is saved as a Draft View (`is_inferred = true`).
* **Pulling Intent:** The local developer runs `chomp pull-intent`. The local MCP compares the Draft View against the current Code Graph and highlights the drift.
* **Agent Execution:** The coding agent reads the drift via MCP and writes the actual code to fulfill the architect's intent.

---

## 5. Phase 4: Enterprise Workspace Stitching

* **The Global Registry:** The Cloud aggregates Contracts and Open Connectors across multiple repositories.
* **Open Connector Linking:** Cloud mechanics (AI or human) "Link" an Open Connector in Repo A (e.g., `fetch('/api/users')`) to a Contract in Repo B (`GET /api/users`).
* **Contract Monitoring:** If Repo B updates its contract (e.g., to `/api/v2/users`), the Cloud flags Repo A's Open Connector as broken. Local environments pull this registry status to prevent breaking changes across service boundaries.
---

## 6. The Cartographer Engine: Initial View vs. Interactive Chat

Creating the visual map requires a balance between frictionless onboarding (low UX friction) and scalable costs (not paying for endless AI chat queries).

### 6.1 The Default View (Chomp Cloud API)
* **The Goal:** A magical "Aha!" moment with zero setup.
* **The Mechanism:** When `chomp ui` opens a new project without a layout, it automatically hits a Chomp-provided endpoint (e.g., `api.chomp.dev/cartographer`). 
* **Privacy & Cost:** The CLI sends a compressed, anonymized schema (just Node IDs and types, no source code). Chomp uses a fast, low-cost model (like Gemini 1.5 Flash) with a strictly controlled system prompt to guarantee a perfect layout structure.

### 6.2 The Interactive Copilot (BYO-Model / Local Brain)
After the default view exists, developers will use the UI chat panel to query the graph and create custom views. To avoid absorbing massive LLM costs for this interactive phase:
* **Local Proxy Execution:** In the bundled UI (`localhost:3000`), the UI chat panel sends messages to the local API. The CLI prompts the user for an LLM API key and stores it locally in `~/.chomp/credentials.json`.
* **Zero Cost to Chomp:** The LLM calls for heavy chat interactions execute directly from the developer's laptop using their own key.
* **SaaS Integration:** In the authenticated Cloud product, users either subscribe to a Pro tier for unlimited queries (using Chomp's enterprise keys) or connect their own LLM provider via OAuth.

### 6.3 IDE/MCP Synchronization (The Remote Control Pattern)
If a developer prefers to use their IDE's agent (e.g., Cursor, Antigravity) rather than the Web UI chat:
* The IDE agent calls the MCP tool `chomp_create_view_projection`.
* The local CLI server (`localhost:5555`) listens for this MCP state change.
* It broadcasts a Server-Sent Event (SSE) to the connected Web UI.
* **The Result:** The developer types in Cursor, and the browser UI instantly animates into the new filtered view, bridging the gap between IDE workflow and rich UI visualizations.

### 6.4 Cloud SaaS Chat (The Non-Technical User)
For Product Managers, non-technical stakeholders, or developers browsing the cloud app without their IDE, the Web UI must provide a first-class chat experience.
* **The Mechanism:** When querying saved projects in the cloud (e.g., "Show me how checkout works"), the LLM request routes through Chomp's Cloud backend.
* **Monetization & Scalability:** To cover LLM costs, this is gated behind a Chomp Pro subscription. For Enterprise tiers, organizations can connect their own provider accounts (e.g., Anthropic/OpenAI OAuth) so Chomp simply acts as a passthrough, incurring zero LLM costs while providing massive organizational value.

---

## 7. View Lifecycle & Git Time Travel

A major architectural challenge is how "Saved Views" interact with the moving target of Git history. If a view is saved today, does it break when the code changes tomorrow? Do we save 10,000 copies of a view for every commit?

### 7.1 Views are "Projections", Not Static Images
We do **not** save views per-commit. A Saved View is stored at the **Project** level. 
* A View is simply a JSON configuration of filters, groupings, and specific Node IDs (e.g., `{ name: "Billing", nodes: ["node_A", "node_B"] }`).
* When a user looks at a specific commit (or branch) and selects a View, Chomp **projects** that View onto the underlying Code Graph of that specific commit.

### 7.2 Handling Drift & Time Travel
Because Views are just projections, Time Travel becomes a native feature:
* **Future Drift:** If a view references `node_A`, but a developer deletes `node_A` in a new commit, the view doesn't break. The Unified Graph Diffing engine detects the missing ID and renders it as a "Ghost Node (Removed)" with a warning: *"This view references 1 node that no longer exists in this commit."* The user can click "Acknowledge" to update and save the view for the modern commit.
* **Going Back in Time:** A user can take today's "Billing View" and apply it to a commit from 2 years ago. Chomp will project it onto the old graph, highlighting the nodes that existed back then. This allows users to literally watch the architectural evolution of a specific feature over time.

### 7.3 The "Lens" Metaphor in Practice
To summarize the UX: 
* **Applying Old View to New Code:** If the view expects `payment_helper.ts` (deleted yesterday), the Graph Diffing Engine renders it as a **Ghost Node (Removed)**. The user can visually see the architectural decay and click to update the view.
* **Applying New View to Old Code:** Projecting today's "Billing View" onto a commit from 2 years ago shows exactly how tiny the service used to be, highlighting only the nodes that existed back then. Views are timeless lenses, not brittle SVGs.
