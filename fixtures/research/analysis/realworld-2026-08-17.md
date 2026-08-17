# Deep Analysis Report: realworld

## 1. Executive Summary
The structural extraction of the `node-express-realworld-example-app` repository successfully captures the high-level architecture of a modern, Prisma-backed Express application. It accurately tracks routing boundaries, controllers, and Prisma DB calls. The extraction performs exceptionally well, natively hitting 100% Connectivity Rate and 100% Scope Purity.

## 2. Extraction Quality Assessment
- **Boundaries**: 37 successfully identified (Files, CJS/ESM Exports).
- **Contracts**: 33 identified (Controllers, Endpoints).
- **Relationships**: 178 identified. Connectivity rate is 100.0%.
- **Open Connectors**: 50 identified, predominantly `DB Call` (Prisma) and `Express HTTP Response`.

*Overall Assessment*: The structural health metrics are perfect. The use of Prisma ORM presents a new pattern of `DB Call` open connectors which are well-identified, bridging the gap between application logic and database interactions.

## 3. Missing Data & Metadata
- **Data Models / Schema**: While Prisma database calls are captured as Open Connectors, the actual `schema.prisma` models (e.g., `User`, `Article`) are not currently parsed into the graph as `CONTRACTS` or `BOUNDARIES`. This means we know *that* the DB is called, but not the shape of the data being queried.
- **Middleware Decorators / Wrappers**: RealWorld uses custom wrapper functions for async handlers (e.g., catching errors). The relationship between the route, the wrapper, and the actual controller logic is slightly obscured.

## 4. Architectural Observations
This repository contrasts with the core `express` library by being an *application* rather than a *framework*. It heavily relies on external Prisma ORM connectors and structured JSON responses. Because it's written in TypeScript, the module resolution and ES6 imports are perfectly resolved by the parser, resulting in the 100% Connectivity Rate.

## 5. Recommended Fixes & Evolutions
- **HIGH**: Implement a `Prisma Schema Adapter` to parse `.prisma` files and generate `BOUNDARY` (Model) and `CONTRACT` (Field) entities. This will allow `DB Call` open connectors to be resolved to actual database schema definitions.
- **MEDIUM**: Add extraction logic for `asyncHandler` patterns commonly used in Express to ensure the route `CONTRACT` links directly to the underlying controller logic.

## 6. Open Questions
- How should we represent ORM queries? Currently they are `OPEN_CONNECTOR` with `entityType: 'DB Call'`. Should they instead be `RELATIONSHIP` edges pointing to the Prisma schema models?
- Are JWT authentication middleware boundaries sufficiently represented, or do we need specific `SECURITY_BOUNDARY` entity types to flag protected routes?
