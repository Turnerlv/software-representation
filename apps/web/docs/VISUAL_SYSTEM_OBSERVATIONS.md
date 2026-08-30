# Visual System Observations & Grid Rules

This document captures the structural rules currently implemented in the Chomp visualizer, as well as universal observations for transitioning to a more accurate, flow-based execution model.

---

## Part 1: Currently Applied Grid & System Rules

The current `GraphVisualizer` implementation enforces a strict spatial-semantic coordinate matrix. The rules currently active in the system are:

### 1. The Strict X-Axis Matrix (Swimlanes)
Nodes are forced into fixed vertical columns based purely on their structural type, regardless of their actual execution flow.
* **HTTP Routes:** `x = 0`
* **Middleware:** `x = 360`
* **Controllers:** `x = 660`
* **Services:** `x = 980`
* **DB Calls:** `x = 1300`
* **Types / Interfaces:** `x = 1640`

### 2. The Y-Axis Domain Sorting
Within each fixed lane, nodes are grouped vertically by their domain (e.g., `auth`, `articles`, `tags`). There is a fixed `80px` gap between different domains to create visual separation.

### 3. Progressive Disclosure (Opacity Engine)
To manage visual complexity, the graph employs an interactive focus engine:
* By default, the graph shows all nodes.
* **On Click:** The clicked node and its immediate upstream/downstream neighbors are isolated.
* Unfocused nodes are dimmed to `12%` opacity and set to grayscale.
* The selected node receives a glowing, domain-specific accent ring.

### 4. Horizontal Aspect Muting (Badges)
Cross-cutting utilities and external packages heavily distort standard layouts due to massive "fan-in" (many nodes pointing to one utility).
* **Rule:** Any node with an in-degree `>= 5`, and all `EXTERNAL_PACKAGE` nodes, are completely removed from the canvas.
* **Representation:** Instead of being drawn as nodes with dozens of tangled edges, they are rendered as inline "badges" (capped at 3 per node) on the nodes that call them.

### 5. Synced Guides & Overlays
Background lane dividers and top-level lane headers are decoupled from the React Flow node engine to prevent bounding-box distortion, but use a shared React context (`useStore`) to perfectly pan and zoom in sync with the graph.

---

## Part 2: Universal Observations (The Pyramid Flow Model)

The strict structural swimlanes (Part 1) inherently misrepresent how software actually behaves. A system is not a set of isolated buckets; it is a branching execution tree. Moving forward, the visualizer should adopt the following universal concepts:

### 1. From Rigid Swimlanes to an Execution Pyramid
The layout should not be organized by the *type* of feature (Controller vs. Service), but by the **flow of data**.
* The visualization should act as a left-to-right execution pyramid (a true Directed Acyclic Graph).
* **Entry Points First:** The layout originates at the outermost boundaries (e.g., `GET /api/articles`).
* **Branching Verticals:** From the entry point, the data branches into specific domain verticals (articles, auth, profiles), flowing naturally through their respective controllers, services, and DB calls based on the *actual edges* rather than arbitrary fixed X-coordinates.

### 2. Prioritizing Real Edges
By letting the actual data flow dictate the X/Y coordinates (using layout algorithms like Dagre, rather than hardcoded X-bins), the graph becomes a genuine representation of how the software executes. Edges become clean and sequential rather than jumping back and forth between rigid structural lanes.

### 3. Redefining Middleware & Cross-Cutting Concerns
In a flow-based pyramid, middleware cannot just live in a standalone column, as it intercepts the flow at very specific points.
* **In-Flow Positioning:** Middleware should be rendered in the flow exactly where it intercepts the request.
* **Distinct Geometric Shape:** Because it acts as an interceptor rather than a standard sequential step, it requires a unique geometric shape (e.g., a diamond or shield) to differentiate it instantly from standard nodes.
* **Global Context Interaction:** Clicking a middleware node should not only show its source class but should highlight/visualize everywhere it is instantiated or injected across the entire system.

### 4. Natural Placement of Shared Utilities (The Converging Node)
In the strict swimlane model, utility and mapping files (like `profile.utils.ts`) are arbitrarily forced into a structural column (like "Types" or "Controllers"). Because they are often shared across domains—such as an article service and a profile service both using the same profile mapper to format user data—they create tangled, cross-canvas edges.
* **In-Flow Convergence:** In a DAG pyramid model, shared utilities with low-to-medium fan-in (which fall below the muting threshold) would naturally sit precisely where they converge in the execution tree. 
* Rather than snapping to the far right, a mapper node would be positioned organically between the data retrieval step (DB calls) and the services that rely on it, showing its true role as a shared data transformer.

### 5. Domain Bounding Boxes (Compound Feature Nodes)
Currently, a single feature like "Articles" is structurally shattered across the graph into separate `Controller`, `Service`, and `Mapper` nodes. While left-to-right flow fixes the routing, the initial view can still be overwhelming.
* **Observation:** The visualization should allow grouping all vertical components of a specific feature domain into a single "Compound Node" or "Domain Bounding Box." 
* This means an entire feature (e.g., Article Controller + Article Service + Article Mapper) can be collapsed into a single high-level node on the initial view. When a user double-clicks or zooms in, it expands to reveal the internal flow (Controller -> Service -> Mapper -> DB). This provides immediate macro-level clarity without sacrificing micro-level execution details.

### 6. Visually Distinguishing Architectural Roles (Interceptors vs. Domain Logic)
The graph data often contains files with similar names that serve fundamentally different architectural purposes. A prime example is `auth.ts` vs `auth.service.ts`:
* **The Global Interceptor (`auth.ts`):** Acts as cross-cutting middleware (JWT validation). It has massive fan-in from almost every controller in the application.
* **The Domain Service (`auth.service.ts`):** Acts as standard business logic (user registration/login). It has a narrow, linear fan-in (only called by the auth controller).
* **Observation:** The visualizer must differentiate these roles geometrically or stylistically. Global interceptors should not look like standard domain nodes. By representing interceptors with distinct shapes (e.g., shields or diamonds) and routing them as gateways, the visualizer can instantly communicate the difference between a global security check and a feature-specific data pipeline.
