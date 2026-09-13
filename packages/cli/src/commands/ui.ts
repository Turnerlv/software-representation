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

Your job is to organize these nodes into a logical Transit Map layout by assigning each node to a 'lane' and giving it a 'role'.

Lanes (numbers): lower numbers are closer to the user-facing entry point.
  1 = "Frontend / CLI Entry"
  2 = "Core Logic / Processing"  
  3 = "Data / Storage / External Services"

Roles MUST BE ONE OF: "INGRESS", "CORE", "EGRESS", "TOP_TRAY", "BOTTOM_TRAY".
  - INGRESS: user-facing entry points (CLI commands, web pages, API routes)
  - CORE: internal processing packages
  - EGRESS: data stores, databases, external APIs
  - TOP_TRAY: cross-cutting utilities used by many (e.g. shared types, config)
  - BOTTOM_TRAY: leaf-level external dependencies (npm packages, sdks)

Also provide human-readable labels:
  - label_primary: short display name (e.g. "@chomp/cli", "React", "SQLite")
  - label_secondary: one-line description of what this node does

Return ONLY a valid JSON array where each object has:
  { "id": string, "lane": number, "role": string, "label_primary": string, "label_secondary": string }

Nodes:
${JSON.stringify(minNodes, null, 2)}

Edges (source → target means source depends on target):
${JSON.stringify(minEdges, null, 2)}
`;

          const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          });

          const responseText = result.response.text();

          try {
            const layoutAssignments = JSON.parse(responseText);
            const layoutData = { nodes: layoutAssignments, edges: minEdges };

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
