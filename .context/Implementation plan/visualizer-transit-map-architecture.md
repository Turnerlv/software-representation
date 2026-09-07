# Chomp Visualizer Architecture & Implementation Plan: The Data Transit Map

**Status:** Proposed / Draft  
**Scope:** `@chomp/core`, `@chomp/db`, `@chomp/cli`, `apps/web`  
**Reference Branch:** `feat/visualizer-scaffolding`  

---

## 1. Vision & Core Philosophy

Software representation is not an arbitrary AST file-tree viewer or a force-directed graph of function calls. It is a **topological transit map of data movement**.

* **The Metaphor:** In a metropolitan transit map, commuters care about where passengers enter (Ingress), where they transfer lines (Pipes/Services), what the major terminal hubs are (Storage/Databases), and where border crossings lead (Egress). The physical curvature of the train tracks is irrelevant.
* **Lexical Code as Evidence:** File paths, directory trees, class declarations, and AST nodes are the **GPS coordinates** that anchor the map to reality. Lexical organization provides line-level proof (`file://...#L42`), but it does not dictate the visual graph topology.
* **Framework Agnosticism:** Framework-specific syntax (Express, Next.js, NestJS, Payload, Fastify) normalizes into universal data-movement roles.

---

## 2. The 5 Universal Data Transit Patterns

Regardless of whether a project uses Express, Next.js, NestJS, or raw Node scripts, data moves through five invariant patterns:

```
[ Ingress Port ] ──► [ Filter / Guard ] ──► [ Domain Transform ] ──► [ Egress / Sink ]
  (Contract)          (Middleware/Pipes)     (Service / Business)     (Open Connector / DB)
```

| Pattern | Transit Role | Description | Framework Realizations | Evidence Anchor |
| :--- | :--- | :--- | :--- | :--- |
| **1. Ingress (Source)** | *Origin Terminal* | Where external data enters the boundary. | Express `app.get`, Next.js `route.ts`, NestJS `@Get`, Queue consumers (`worker.on`), CLI flags. | AST function declaration or route call with HTTP method/path. |
| **2. Guard & Transform** | *Checkpoint / Transfer* | Where data is authenticated, validated, or enriched before business logic. | Middleware chains (`auth()`), Zod/DTO validators, NestJS interceptors, request parsers. | AST middleware arguments, validation schema calls. |
| **3. Dispatch & Internal Relay** | *Inter-Station Rail* | Where data moves across internal layers or package boundaries. | Controller calling Service, Service calling Repository, monorepo workspace imports. | AST call expressions, DI constructor injections, workspace imports. |
| **4. Persistence / Sink** | *Storage Terminal* | Where data halts, mutates state, or is queried. | Drizzle queries (`db.insert`), Prisma calls, Payload collection writes, Redis sets. | ORM method chains, SQL queries, cache writes. |
| **5. Egress (External Dispatch)** | *Border Crossing* | Where data leaves the known boundary for third-party systems. | Outbound HTTP (`fetch`, `axios`), queue publishers (`producer.send`), Stripe SDK. | Outbound network calls, client SDK invocations. |

---

## 3. UI Components in the Transit Map

In frontend and full-stack architectures, **components are the middleware, routers, and data pipes**. They are classified into three functional tiers to prevent leaf JSX noise (`<div>`, `<span>`, `<Icon>`) from overwhelming the graph:

```
FRONTEND DATA CONDUIT:
[ Page / Route View ] ──► [ <AuthProvider> ] ──► [ <FormContext> ] ──► [ <CheckoutWidget> ]
```

1. **Context Providers & Layouts (`role: "TOP_TRAY"` or Guard):**
   * Ambient middleware that wraps child trees, injects state, or blocks rendering (e.g., `<AuthProvider>`, `<TenantProvider>`, `<DashboardLayout>`).
2. **Data-Bound Feature Containers (`role: "CORE"`):**
   * UI controllers that manage state mutations, invoke custom hooks, or bridge UI actions to backend Open Connectors (`<CheckoutForm>`, `<UserProfileCard>`, `<DataTable>`).
3. **UI Primitives / Component Libraries (`role: "PRIMITIVE"`):**
   * Pure input/output contracts (e.g., `<Button>`, `<Input>`, `<Dialog>`). 
   * **At L1:** The component library (`packages/ui`) renders as a shared foundational transit hub.
   * **At L2:** Primitives render as the terminal stations of user interaction (Props = Inbound Contract; Callbacks/Events = Outbound Relay).

---

## 4. The Dual-Role Engine: Surveyor vs. Cartographer

Deterministic graph layouts (Sugiyama, pure DAG longest-path) fail on raw AST code because codebases contain cyclical imports, asymmetric call trees, and cross-cutting utility noise. 

The architecture strictly separates the **Surveyor** from the **Cartographer**:

```
┌──────────────────────────────────────────────────────────┐
│              1. THE SURVEYOR (@chomp/core)               │
│  - Deterministic AST Parser & Schema Validator           │
│  - Extracts Nodes, Edges, Contracts, Evidence Records    │
│  - INVARIANT GROUND TRUTH (Never invents or hallucinates)│
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│              2. THE CARTOGRAPHER (AI via MCP)            │
│  - Organizes discrete topology (lane, depth, role)       │
│  - Assigns human semantic labels (label_primary)         │
│  - Hypothesizes missing connections (is_inferred: true)  │
│  - STRICTLY GUARDED: Cannot invent non-existent node IDs │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│             3. THE TRANSIT BOARD (apps/web)              │
│  - React Flow + Topological Grid Layout Engine           │
│  - Renders solid deterministic edges vs. dashed inferred │
│  - Handles compound domain boxes & cross-cutting trays   │
└──────────────────────────────────────────────────────────┘
```

---

## 5. Visual Grammar & Design System (Expanding `GraphVisualizer.tsx`)

To replace uniform rectangular boxes with an intuitive transit visual language:

### Node Geometries by Transit Role
* **Ingress Gateway (`role: "INGRESS"`):** Portal/pill shape with a green indicator accent. Denotes system entry points.
* **Interceptor / Guard (`role: "TOP_TRAY"` or in-flow):** Shield or diamond shape with an amber badge. Denotes security, auth, or schema validation.
* **Core Processing Station (`role: "CORE"`):** Rectangular transit station showing `label_primary` (semantic action) in prominent type with `label_secondary` (source AST anchor) in monospace.
* **Storage Terminal / Sink (`role: "EGRESS"` / DB):** Cylinder or rounded dock shape with a blue/purple indicator. Denotes database persistence.
* **External Border Crossing (`role: "EGRESS"` / 3rd-party):** Terminal with an outward plug icon denoting third-party network dispatch (Stripe, SendGrid).

### Handling High Fan-In ("The Third Rail")
Cross-cutting utilities (loggers, telemetry, database connection pools, global JWT auth) with in-degree $\ge 5$ must never be drawn with 50 cross-canvas lines. They are:
1. Docked in the `TOP_TRAY` / `BOTTOM_TRAY` as ambient utilities, or
2. Rendered as compact **badges / chips** directly on the consuming node.

---

## 6. Multi-View Lifecycle & State Management

To support conversational querying via the web chat without destroying the master transit map, views exist in three distinct lifecycle states:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VIEW LIFECYCLE MODEL                            │
│                                                                        │
│  [1. Canonical Default] ──(User query in chat)──► [2. Ephemeral View]  │
│    (Master Transit Map)                               (In-memory Lens) │
│            ▲                                                  │        │
│            │                                                  │        │
│            │ (Explicit "Set as Default")        (User/AI clicks "Save")│
│            │                                                  ▼        │
│            └──────────────────────────────────── [3. Named Saved View] │
│                                                   ("Payment Flow")     │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Canonical Default View (`is_default = true`):**
   * The master high-level transit map generated upon repo analysis.
   * Rendered immediately on first paint in `apps/web` (0ms latency, zero AI cost on load).
2. **Ephemeral Views (In-Memory Lenses):**
   * Generated when a user queries in chat (*"Show me all paths touching Stripe"*, *"Slice out the billing pipeline"*).
   * Renders instantly on the canvas, living purely in client state with an option banner: `[Save as Named View] [Reset to Default]`.
3. **Named Saved Views (Persistent SQLite Records):**
   * Promoted from an ephemeral view or created intentionally.
   * Accessible via a top-level **View Switcher Dropdown** in the visualizer.

---

## 7. Database Persistence: The `layout_views` Table

To eliminate unversioned `grid_layout.json` files and prevent synchronization drift, layout projections are stored in SQLite in `packages/db/src/adapters/sqlite/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS layout_views (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS layout_nodes (
  layout_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  lane TEXT,
  role TEXT,
  x INTEGER,
  y INTEGER,
  PRIMARY KEY (layout_id, node_id),
  FOREIGN KEY (layout_id) REFERENCES layout_views(id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
```

> **Architectural Note:** We use a strict `layout_nodes` join-table instead of a JSON blob (`layout_data TEXT`). This enforces SQLite `FOREIGN KEY` constraints, creating a "hallucination firewall." If the AI Cartographer hallucinates a non-existent `node_id`, the database rejects the transaction.

### Staleness Tracking (The Principle of Incomplete Truth)
When code changes and `chomp analyze` runs:
1. `repositories.commit_sha` updates.
2. The UI detects if `layout_views.stale_commit_sha != repositories.commit_sha`.
3. An alert appears: *"Transit map reflects commit `a1b2c3`. 3 new contracts have not yet been mapped by the Cartographer."*
4. The user or agent triggers a re-alignment without blowing away manual adjustments.

---

## 8. Web App Architecture: Split Canvas & Copilot Drawer

`apps/web` combines the reactive canvas with a copilot drawer:

```
┌──────────────────────────────────────────────────────────┬──────────────────────┐
│  [ View: Master Map ▼ ]    [ ● Live Synced ]             │  CHOMP COPILOT       │
├──────────────────────────────────────────────────────────┤                      │
│                                                          │ > Show me all paths  │
│                     CANVAS (React Flow)                  │   touching stripe    │
│                                                          │                      │
│   [POST /checkout] ──► [CheckoutService] ──► [Stripe]    │ Found 3 nodes and    │
│                                                          │ 2 edges. I've focused│
│                                                          │ the canvas on this.  │
│                                                          │                      │
│                                                          │ [Save View] [Reset]  │
└──────────────────────────────────────────────────────────┴──────────────────────┘
```

### Copilot Tool Actions on the Canvas:
1. `focus_subgraph(node_ids, hops)`: Non-destructive lens; dims non-relevant nodes to 12% opacity.
2. `create_view_projection(layout_data, is_temporary)`: Loads a new spatial layout into React Flow state.
3. `save_current_view(name, slug, set_default)`: Commits the active canvas state to `layout_views` via Server Action.
4. `spatial_lock(nodes)`: Preserves manual user node drags so AI re-runs do not scramble human-arranged layouts.

---

## 9. Implementation Phases

### Phase 1: Storage Layer & Schema Migration (`packages/db`)
- [ ] Add `layout_views` table to `packages/db/src/adapters/sqlite/schema.ts`.
- [ ] Update `ChompStorage` interface with:
  - `saveLayoutView(repoId: string, view: LayoutView): Promise<void>`
  - `getLayoutView(repoId: string, slug?: string): Promise<LayoutView | null>`
  - `listLayoutViews(repoId: string): Promise<LayoutViewSummary[]>`
  - `deleteLayoutView(repoId: string, slug: string): Promise<boolean>`

### Phase 2: CLI & MCP Server Upgrade (`packages/cli`)
- [ ] Refactor `chomp_save_grid_layout` in `packages/cli/src/commands/mcp.ts` to write to `layout_views` table instead of `grid_layout.json`.
- [ ] Add `chomp_get_layout_view` and `chomp_list_layout_views` tools to MCP server.
- [ ] Add CLI command: `chomp layout [--generate|--view <slug>]`.

### Phase 3: Visualizer Design System (`apps/web`)
- [ ] Expand `GraphVisualizer.tsx` to register semantic node types:
  - `<GatewayNode />` (Ingress)
  - `<ShieldNode />` (Guards / Interceptors)
  - `<StationNode />` (Core domain)
  - `<StorageNode />` (Database / Sinks)
- [ ] Add interactive edge styling: solid line with hover tooltip for deterministic edges; dashed amber/red line with reason popover for `is_inferred` edges.
- [ ] Implement Top/Bottom Tray panels for high fan-in utilities.

### Phase 4: Copilot Drawer & View Synchronization (`apps/web`)
- [ ] Build top navigation **View Switcher Dropdown** (`Master Map`, `Custom Saved Views...`).
- [ ] Build Copilot Chat Drawer powered by the MCP/server-action protocol.
- [ ] Support ephemeral lens switching with "Save View" and "Reset" action controls.
- [ ] Implement drag-and-drop position auto-saving with human spatial lock.
