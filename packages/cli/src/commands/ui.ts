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

          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

          async function generateLayout(minNodes: any[], minEdges: any[], isL1: boolean, pkgName?: string) {
            const prompt = `
You are the Chomp Cartographer, an AI expert in software architecture.
I am providing you a structural subgraph representing ${isL1 ? "a monorepo's macroscopic package topology" : `the internal files of the package: ${pkgName}`}.

Your job has TWO parts:

PART 1 — NODE LAYOUT: Assign each node a domain, role, and human-readable labels.
Domains represent semantic boundaries or subsystems (e.g., "Frontend", "Backend", "Data Layer", "Infrastructure").
Nodes in the same logical subsystem should share the same domain string.

CRITICAL ROLE RULES:
${isL1 ? `
- Nodes with entityType "WORKSPACE_PACKAGE" MUST use ONLY: "INGRESS", "CORE", or "EGRESS"
  - INGRESS: user-facing packages (CLI, web frontend)
  - CORE: internal processing packages
  - EGRESS: data storage and persistence packages
- Nodes with entityType "EXTERNAL_PACKAGE" use "TOP_TRAY" or "BOTTOM_TRAY"
- NEVER assign TOP_TRAY or BOTTOM_TRAY to a WORKSPACE_PACKAGE
` : `
- You must use ONLY: "INGRESS", "CORE", or "EGRESS" for internal files.
  - INGRESS: Entry points (index.ts, API handlers, UI components)
  - CORE: Business logic, utilities, services
  - EGRESS: Repositories, database clients, external adapters
`}

PART 2 — EDGE CLASSIFICATION: For every edge, determine whether it represents actual DATA FLOW or an INTERFACE/TYPE DEPENDENCY.
Edge types:
  "DATA_FLOW" — runtime data passes through (function calls, HTTP, queries). The source CALLS the target.
  "INTERFACE" — structural/type dependency (implements, extends, imports types only). No runtime data exchange.
  "CONFIG"    — configuration or build-time dependency.

Return a single JSON object with this exact shape:
{
  "nodes": [ { "id": string, "domain": string, "role": string, "label_primary": string, "label_secondary": string } ],
  "edges": [ { "source": string, "target": string, "edge_type": "DATA_FLOW" | "INTERFACE" | "CONFIG" } ]
}
Every input edge must appear in the output edges array.

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
            const parsed = JSON.parse(responseText);

            const layoutAssignments: any[] = Array.isArray(parsed) ? parsed : (parsed.nodes ?? []);
            const edgeClassifications: any[] = Array.isArray(parsed) ? [] : (parsed.edges ?? []);

            if (isL1) {
              const workspaceIds = new Set(minNodes.filter(n => n.entityType === 'WORKSPACE_PACKAGE').map(n => n.id));
              const TRAY_ROLES = new Set(['TOP_TRAY', 'BOTTOM_TRAY']);
              for (const assignment of layoutAssignments) {
                if (workspaceIds.has(assignment.id) && TRAY_ROLES.has(assignment.role)) {
                  assignment.role = 'CORE';
                }
              }
            }

            const classifiedMap = new Map<string, string>();
            for (const ce of edgeClassifications) {
              classifiedMap.set(`${ce.source}::${ce.target}`, ce.edge_type ?? 'DATA_FLOW');
            }

            const classifiedEdges = minEdges.map(e => ({
              source: e.source,
              target: e.target,
              edge_type: classifiedMap.get(`${e.source}::${e.target}`) ?? 'DATA_FLOW',
            }));

            return { nodes: layoutAssignments, edges: classifiedEdges };
          }

          // 1. Condense and run L1 Macro Layout
          const condensed = condenseGraph(graph);
          const l1MinNodes = condensed.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, entityType: n.entityType }));
          const l1MinEdges = condensed.edges.map(e => ({ source: e.sourceId, target: e.targetId }));
          
          console.log(`\n🗺️  Cartographer L1: mapping ${l1MinNodes.length} packages...`);
          const l1Layout = await generateLayout(l1MinNodes, l1MinEdges, true);
          
          const layoutData: any = { nodes: l1Layout.nodes, edges: l1Layout.edges, subgraphs: {} };

          // 2. Iterate through packages and run L2 Micro Layouts
          const workspacePackages = condensed.nodes.filter(n => n.entityType === 'WORKSPACE_PACKAGE');
          
          for (const pkg of workspacePackages) {
            const internalNodes = graph.nodes.filter(n => n.parentBoundaryId === pkg.id);
            if (internalNodes.length === 0) continue;

            const internalIds = new Set(internalNodes.map(n => n.id));
            const internalEdges = graph.edges.filter(e => internalIds.has(e.sourceId) && internalIds.has(e.targetId!));

            const l2MinNodes = internalNodes.map(n => ({ id: n.id, name: n.name, type: n.type, entityType: n.entityType }));
            const l2MinEdges = internalEdges.map(e => ({ source: e.sourceId, target: e.targetId }));

            console.log(`🗺️  Cartographer L2: mapping ${l2MinNodes.length} internals for ${pkg.name}...`);
            const l2Layout = await generateLayout(l2MinNodes, l2MinEdges, false, pkg.name);
            layoutData.subgraphs[pkg.id] = l2Layout;
          }

          const gridLayoutPath = join(dirname(dbPath), "grid_layout.json");
          writeFileSync(gridLayoutPath, JSON.stringify(layoutData, null, 2));

          console.log(`✅  Cartographer: multi-stage layout saved to ${gridLayoutPath}`);
          return res.json({ assignments: layoutData.nodes, subgraphs: layoutData.subgraphs });
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
