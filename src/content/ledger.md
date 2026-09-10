# Software Representation Ledger
## Foundational Thesis v3.0

**Turner Vickery** · Software architect and platform engineer · Originally published September 2026

⸻

### Mission
Establish Software Representation as a missing, first-class engineering discipline of software development.
*   Not to generate software.
*   Not to document software.
*   Not to govern software.
*   Not to replace the tools that already exist.
*   To enable software systems to continuously and autonomously represent their own observable structure.

⸻

### Core Hypothesis
A software system can autonomously derive and maintain an accurate structural representation of itself from the artifacts it already produces.
This representation must evolve continuously alongside the software, require zero manual maintenance, and remain strictly grounded in observable code evidence.

⸻

### The Missing Discipline
Modern software development has established rigorous disciplines for Software Engineering, Testing, Deployment, Observability, Security, and Design Systems. Each optimizes a distinct operational or lifecycle stage.
None exists primarily to continuously maintain a shared structural understanding of the software system itself.
Software Representation proposes this missing discipline. Its purpose is to make the structure of software continuously knowable, queryable, and understandable to both human developers and intelligent systems.

⸻

### The Foundational Distinction
Software Representation begins with a fundamental separation between three distinct categories of system knowledge:
*   **Structure (What exists?):** The identifiable entities, boundaries, contracts, relationships, and connection points that can be established directly from artifact evidence.
*   **Behavior (What happens?):** The execution paths, runtime telemetries, and system flows that emerge dynamically when the system operates.
*   **Rationale (Why does it work this way?):** The human decisions, constraints, organizational structures, and design trade-offs behind the architecture.

The foundational thesis focuses on **Structure**. Behavior can enrich structure through dynamic trace mappings. Rationale can decorate structure via historical context.
Crucially, a structural representation must never claim certainty about one category based solely on evidence from another.

⸻

### Source of Truth
*   Source code is implementation.
*   Documentation is interpretation.
*   Architecture diagrams are snapshots.
*   Human tribal knowledge is temporary.

A structural representation is continuously derived from evidence. It does not replace these existing sources; it acts as a persistent structural reference that connects them. It provides the shared structural foundation from which diverse, downstream viewpoints can be derived.

⸻

### The Principle of Incomplete Truth
A trustworthy representation does not need to be complete. It needs to be accurate about what it knows and completely honest about what it does not.
*   An unknown is a valid structural state.
*   An open connector is a valid structural representation.
*   The system must never fabricate relationships or guess connections to present a complete graph.
*   Represent uncertainty; never manufacture certainty.

⸻

### The Structural Ontology & Primitives
The core ontology models software systems through three primary structural primitives and one distinct non-peer extension:

#### Core Primitives:
1.  **BOUNDARY (Structural Scopes):** Scopes defining where a structural unit begins and ends. Boundaries form the hierarchical containment tree of a repository. (Examples: Repositories, directories, file boundaries, classes, components).
2.  **CONTRACT (Explicit Interfaces):** Strictly defined communication interfaces exposed by boundaries through which external entities must interact. (Examples: API routes, gRPC definitions, exported types, event schemas).
3.  **RELATIONSHIP (Structural Connections):** Known, evidence-backed composition or usage edges connecting structural nodes. (Examples: Static imports, direct method calls, database writes, class inheritance).

#### Non-Peer Extension:
*   **OPEN_CONNECTOR (External Exit Points):** Known outbound communication points whose external counterpart cannot be determined within the available local context. (Examples: HTTP client fetches, raw database queries, external event publishing).
*   *Status:* Open Connectors are structurally distinct and are **not** primitives on equal footing with Boundaries, Contracts, and Relationships. They serve as exit vectors that remain open until collaborative, multi-repository evidence corroborates and resolves them into relationships.

⸻

### Lexical Scope vs. Compositional Usage
To scale representations to large codebases without graph explosion or structural "spaghetti," the framework separates containment from interaction:
*   **Lexical Scope (Containment Hierarchy):** Represents where code physically resides. It forms a strict, acyclic tree modeled via `parent_boundary_id`. A boundary has at most one lexical parent.
*   **Compositional Usage (Interaction Graph):** Represents how code communicates. It forms the network graph modeled strictly as directional `RELATIONSHIP` edges. A boundary supports an arbitrary number of incoming and outgoing relationships.

⸻

### Dynamic Derivation of Architectural Roles
Rather than relying on fragile, subjective human tags (e.g., "Controller," "Service"), a representation dynamically derives structural roles from **graph topology metrics**—such as In-Degree and Out-Degree edge densities:
*   *Horizontal Utilities:* High In-Degree, Low Out-Degree (e.g., cross-cutting aspects like loggers, auth guards, utility components).
*   *Entry Orchestrators:* Low In-Degree, High Out-Degree (e.g., entry routers, message subscribers).
*   *Domain Core:* Balanced In-Degree and Out-Degree (e.g., internal business services).
*   *Terminal Open Connectors:* High In-Degree, Out-Degree = 0 (e.g., raw SQL integrations, third-party exit clients).

⸻

### The Human-in-the-Loop & Evidence Confidence Model
A structural representation respects the boundaries of deterministic compilation: **AI proposes, evidence corroborates, and humans validate**.
*   Deterministic code structures extracted directly by AST parsers form the baseline ground truth.
*   Probabilistic semantic links or exit-connector matchings are explicitly flagged as hypotheses.
*   Confidence is calculated not by opaque AI heuristics, but by **cross-cutting corroboration across independent evidence sources**:
    *   *Low Confidence (1 Source):* Mapped to a single file-level reference.
    *   *Medium Confidence (2-3 Sources):* Mapped to multiple, distinct artifacts (e.g., static imports plus config bindings).
    *   *High Confidence (4+ Sources):* Confirmed by independent, cross-cutting layers (e.g., imports, API schemas, and production traces).
*   All human-engineered validations must be preserved as high-priority database states, ensuring automated re-extraction syncs never overwrite human intent.

⸻

### Spatial-Semantic Mapping: Vertical Flows vs. Horizontal Invariants
The spatial layout of a software representation is not merely an aesthetic choice or a random visual diagram. Spatial arrangement represents **semantic meaning**—it is a cognitive map designed to align human mental models with software reality.
*   **Vertical Execution Flows (The X-Axis):** Represents request lifecycles. Execution flows sequentially through strict vertical columns, moving from entry contracts, to orchestration components, to domain logic, and finally to infrastructure terminals and database exit points.
*   **Horizontal Invariants (The Y-Axis):** Represents isolated business domains or feature contexts (e.g., "Auth", "Billing"). Isolating parallel domains into horizontal swimlanes prevents cross-domain intersections from cluttering the architectural model.
*   **Aspect Interception:** High-frequency horizontal utility nodes (such as authentication or logging guards) are cross-cutting invariants rather than standard flow elements. Drawing direct compositional edges to these aspects degrades layout legibility. Instead, they are collapsed into lightweight badges on the calling containers, mathematically preserving clean vertical execution paths.
*   **Spatial Stability:** To support historical comparison and git diff code comparisons across branches, the spatial coordinates of unmodified boundaries must remain deterministic and stable. If nodes drift or wander randomly between extractions, structural changes become impossible to track.

This spatial-semantic architecture is not a visual UI library standard; it is a conceptual framework for translating mathematical graph topologies into stable, digestible human mental models.

⸻

### The Autonomy of the Core Product (Downstream Applications)
The **Software Representation is the core product**. It is the structured database, the verified ontology, and the deterministic evidence map.
All tools that interact with or present this data are **downstream consumers** of the representation:
*   *Visualizers (React Flow) and Diagrams:* Render distinct, filtered visual projections of the core model.
*   *Developer Interfaces (MCP, APIs, CLIs):* Provide standard protocol boundaries to query or stream structural graphs directly into developer IDEs or AI agents.
*   *Change Management and Impact Tools:* Trace blast radiuses and contracts to evaluate git diff pull requests.
*   *SaaS Portals & Service Catalogs:* Populate high-level system directories from live evidence.

The core representation is completely decoupled from these downstream manifestations. By maintaining a pure, queryable representation schema, we ensure the system can serve any application without becoming entangled in transient interface standards.

⸻

### The Scientific Research Loop & Vacuum Testing
To maintain the integrity of the software representation discipline, the parsing engine must be subjected to a rigorous, scientific feedback loop:
*   **Coverage (The Pattern Ledger) vs. Correctness (The Bug Tracker):** Discovered issues are strictly separated based on *Visitor Intent*. Coverage gaps (lack of parser code) are logged in the Pattern Ledger; correctness defects (broken parser execution) are logged in the Bug Tracker. This separation ensures coverage metrics remain mathematically pure.
*   **The Vacuum Testing Protocol:** Extraction logic must operate as a pure, mathematical function. It is tested in a sterile, offline sandbox with zero database connections or file-system mutations. All parser updates are validated through deep structural assertions against pre-committed, immutable expected manifests.

⸻

### MVP Success Criteria
We evaluate the validity of the Software Representation discipline through two progressive tests:
1.  **The Accuracy Test:** Connect the engine to a complex, unfamiliar repository and produce a structural representation that experienced developers of that system recognize as accurate. The desired response is: *"Yes, that is how our system actually works."*
2.  **The Reusability Test:** Can an outside developer or intelligent machine use the exported representation schema to understand, query, or build something useful on top of the codebase without the original authors explaining it manually?

This transitions software architecture from fragile human narrative to an active, reusable, and self-explaining software interface.

⸻

### North Star
**Software should continuously represent itself.** Everything else is an application of that principle.

---

© 2026 Turner Vickery. This work is licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You are free to share and adapt this material for any purpose, including commercially, as long as you give appropriate credit to the original author.
