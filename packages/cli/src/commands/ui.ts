import { Command } from "commander";
import express from "express";
import cors from "cors";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSQLiteStorage } from "@chomp/db";
import { condenseGraph } from "@chomp/core";
import { GoogleGenerativeAI } from "@google/generative-ai";

export function registerUiCommand(program: Command): void {
  program
    .command("ui")
    .description("Start the local Chomp server and open the Local Transit Board")
    .option("-p, --port <number>", "Port to run the local server on", "5555")
    .option("--db <path>", "Path to SQLite database file (default: ./.chomp/graph.db)")
    .action(async (options: { port: string; db?: string }) => {
      const port = parseInt(options.port, 10);
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const baseDir = process.env.INIT_CWD ?? process.cwd();

      const repoName = basename(baseDir);
      const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

      const defaultDbDir = resolve(baseDir, ".chomp");
      const dbPath = options.db
        ? resolve(baseDir, options.db)
        : resolve(defaultDbDir, "graph.db");

      if (!existsSync(dbPath)) {
        console.error(`Error: No Chomp database found at ${dbPath}`);
        console.error(`Please run 'chomp analyze .' first to generate the graph.`);
        process.exit(1);
      }

      const app = express();

      app.use(cors());
      app.use(express.json({ limit: "50mb" }));

      // 1. Serve the bundled Next.js static export
      // In production, this points to dist/ui. During monorepo dev, it points to apps/web/out.
      let uiPath = join(__dirname, '../../../../apps/web/out');
      if (!existsSync(uiPath)) {
        uiPath = join(__dirname, '../ui'); // Production CLI location
      }
      app.use(express.static(uiPath));

      // 2. API: Get Graph
      app.get("/api/graph", async (req, res) => {
        try {
          const storage = createSQLiteStorage(dbPath);
          const repos = await storage.listRepositories();

          if (repos.length === 0) {
            await storage.close();
            return res.status(404).json({ error: "No repositories found in database." });
          }

          const targetRepoId = repos[0].id;
          const graph = await storage.getRepresentationGraph(targetRepoId);
          await storage.close();

          if (!graph) {
            return res.status(404).json({ error: "Graph not found for this repository." });
          }

          // Try to attach grid layout if it exists
          let gridLayout = null;
          const gridLayoutPath = join(dirname(dbPath), "grid_layout.json");
          if (existsSync(gridLayoutPath)) {
            try {
              gridLayout = JSON.parse(readFileSync(gridLayoutPath, "utf-8"));
            } catch (e) {
              console.error("Failed to parse grid_layout.json");
            }
          }

          res.json({
            nodes: graph.nodes,
            edges: graph.edges,
            gridLayout
          });
        } catch (error) {
          console.error("Error fetching graph:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      });

      // 3. API: Cartographer Layout
      // Reads the graph directly from the DB — no client payload needed, eliminating
      // the 413 Payload Too Large error that occurs when POSTing the full raw graph.
      app.post("/api/cartographer", async (req, res) => {
        try {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            return res.status(500).json({ error: "GEMINI_API_KEY is not configured in environment." });
          }

          // Read the graph from the DB directly — dbPath is already in scope
          const storage = createSQLiteStorage(dbPath);
          const repos = await storage.listRepositories();
          if (repos.length === 0) {
            await storage.close();
            return res.status(404).json({ error: "No repositories found in database." });
          }
          const graph = await storage.getRepresentationGraph(repos[0].id);
          await storage.close();

          if (!graph) {
            return res.status(404).json({ error: "Graph not found for this repository." });
          }

          // Condense to package-level topology before sending to the AI
          const condensed = condenseGraph(graph);

          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

          const minNodes = condensed.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, entityType: n.entityType }));
          const minEdges = condensed.edges.map(e => ({ source: e.sourceId, target: e.targetId }));

          console.log(`\n🗺️  Cartographer: condensed graph to ${minNodes.length} nodes, ${minEdges.length} edges. Calling AI...`);

          const prompt = `
You are the Chomp Cartographer, an AI expert in software architecture.
I am providing you a condensed macroscopic list of structural nodes and edges representing a monorepo's package topology.

Your job has TWO parts:

PART 1 — NODE LAYOUT: Assign each node a domain, role, and human-readable labels.

Domains represent semantic boundaries or subsystems (e.g., "Frontend", "Backend", "Data Layer", "Infrastructure", "Core Engine").
Nodes that belong to the same logical subsystem should share the same domain string. The layout engine will mathematically calculate their exact position, but it will group nodes with the same domain together.

CRITICAL ROLE RULES:
- Nodes with entityType "WORKSPACE_PACKAGE" MUST use ONLY: "INGRESS", "CORE", or "EGRESS"
  - INGRESS: user-facing packages (CLI entry, web frontend, API gateway)
  - CORE: internal processing packages (parsers, engines, protocol servers, business logic)
  - EGRESS: data storage and persistence packages (databases, ORMs, queue sinks)
- Nodes with entityType "EXTERNAL_PACKAGE" use "TOP_TRAY" or "BOTTOM_TRAY"
- NEVER assign TOP_TRAY or BOTTOM_TRAY to a WORKSPACE_PACKAGE

PART 2 — EDGE CLASSIFICATION: For every edge, determine whether it represents actual
DATA FLOW (data moves through it at runtime) or a TYPE/INTERFACE DEPENDENCY
(one package imports types, interfaces, or abstract contracts defined by another, but
data does not flow through this relationship at runtime).

Edge types:
  "DATA_FLOW"  — runtime data passes through: function calls with results, HTTP requests,
                 queue messages, events, database queries. The source CALLS the target.
  "INTERFACE"  — structural/type dependency: implements an interface, extends a class,
                 imports types/schemas for type-checking only. No runtime data exchange.
  "CONFIG"     — configuration or build-time dependency only.

IMPORTANT: An edge where a storage/persistence package imports from a core/domain package
to implement its storage interface is almost always "INTERFACE", not "DATA_FLOW".

Return a single JSON object with this exact shape:
{
  "nodes": [
    { "id": string, "domain": string, "role": string, "label_primary": string, "label_secondary": string }
  ],
  "edges": [
    { "source": string, "target": string, "edge_type": "DATA_FLOW" | "INTERFACE" | "CONFIG" }
  ]
}

Every input edge must appear in the output edges array. Do not add or remove edges.

Nodes:
${JSON.stringify(minNodes, null, 2)}

Edges (source imports/depends on target):
${JSON.stringify(minEdges, null, 2)}
`;

          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          });

          const responseText = result.response.text();

          try {
            const parsed = JSON.parse(responseText);

            // Support both old flat-array format and new { nodes, edges } format
            const layoutAssignments: any[] = Array.isArray(parsed) ? parsed : (parsed.nodes ?? []);
            const edgeClassifications: any[] = Array.isArray(parsed) ? [] : (parsed.edges ?? []);

            // Guard: WORKSPACE_PACKAGE nodes must never receive tray roles.
            const workspaceIds = new Set(condensed.nodes
              .filter(n => n.entityType === 'WORKSPACE_PACKAGE')
              .map(n => n.id));
            const TRAY_ROLES = new Set(['TOP_TRAY', 'BOTTOM_TRAY']);
            for (const assignment of layoutAssignments) {
              if (workspaceIds.has(assignment.id) && TRAY_ROLES.has(assignment.role)) {
                console.warn(`⚠️  Cartographer: corrected ${assignment.label_primary ?? assignment.id} from ${assignment.role} → CORE`);
                assignment.role = 'CORE';
              }
            }

            // Merge AI edge classifications with the condensed edge list.
            // Build a lookup from the AI's classified edges: "srcId::tgtId" → edge_type
            const classifiedMap = new Map<string, string>();
            for (const ce of edgeClassifications) {
              classifiedMap.set(`${ce.source}::${ce.target}`, ce.edge_type ?? 'DATA_FLOW');
            }

            // Produce final edges: every condensed edge gets an edge_type.
            // Default to DATA_FLOW for any edge the AI didn't classify (backward compat).
            const classifiedEdges = minEdges.map(e => ({
              source: e.source,
              target: e.target,
              edge_type: classifiedMap.get(`${e.source}::${e.target}`) ?? 'DATA_FLOW',
            }));

            // Log the classification for debugging
            for (const e of classifiedEdges) {
              const srcLabel = layoutAssignments.find((n: any) => n.id === e.source)?.label_primary ?? e.source;
              const tgtLabel = layoutAssignments.find((n: any) => n.id === e.target)?.label_primary ?? e.target;
              console.log(`  ${e.edge_type === 'DATA_FLOW' ? '→' : '⇢'} ${srcLabel} → ${tgtLabel} [${e.edge_type}]`);
            }

            const layoutData = { nodes: layoutAssignments, edges: classifiedEdges };

            const gridLayoutPath = join(dirname(dbPath), "grid_layout.json");
            writeFileSync(gridLayoutPath, JSON.stringify(layoutData, null, 2));

            console.log(`✅  Cartographer: layout saved to ${gridLayoutPath}`);
            return res.json({ assignments: layoutAssignments });
          } catch (e) {
            return res.status(500).json({ error: "AI returned invalid JSON", raw: responseText });
          }
        } catch (error: any) {
          console.error("Cartographer error:", error);
          return res.status(500).json({ error: error.message || "Internal server error" });
        }
      });

      // 4. Fallback for React Router / SPA
      app.use((req, res) => {
        res.sendFile(join(uiPath, "index.html"));
      });

      app.listen(port, () => {
        console.log(`\n🟢 Chomp Local Server running on http://localhost:${port}`);
        console.log(`\nTo view your Local Transit Board, open your browser to:`);
        console.log(`👉 http://localhost:${port}\n`);
      });
    });
}
