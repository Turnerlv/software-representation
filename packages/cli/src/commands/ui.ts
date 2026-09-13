import { Command } from "commander";
import express from "express";
import cors from "cors";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, basename, dirname, join } from "node:path";
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
      app.use(express.json());

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
      app.post("/api/cartographer", async (req, res) => {
          try {
            const { nodes, edges } = req.body;
            if (!nodes || !Array.isArray(nodes)) {
              return res.status(400).json({ error: "Invalid nodes array provided." });
            }

            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
              return res.status(500).json({ error: "GEMINI_API_KEY is not configured in environment." });
            }

            const condensed = condenseGraph({ nodes, edges: edges || [], extractorVersion: "0", analyzedAt: "" });

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

            const minNodes = condensed.nodes.map(n => ({ id: n.id, name: n.name, type: n.type }));
            const minEdges = condensed.edges.map(e => ({ source: e.sourceId, target: e.targetId, type: e.type }));

            const prompt = `
You are the Chomp Cartographer, an AI expert in software architecture. 
I am providing you a condensed macroscopic list of structural nodes and edges representing an application's topology.

Your job is to organize these nodes into a logical Transit Map layout by assigning each node to a 'lane' and giving it a 'role'.

Lanes could be (as numbers): 1 for "Ingress/Gateway", 2 for "Core/Middle", 3 for "Egress/DB/External".
Roles MUST BE ONE OF: "INGRESS", "CORE", "EGRESS", "TOP_TRAY", "BOTTOM_TRAY".

Return ONLY a valid JSON array where each object has:
- id: (the exact node id from the input)
- lane: (number, the lane this node belongs in, lower numbers are closer to the entry point)
- role: (string, the role of this node)

Nodes:
${JSON.stringify(minNodes, null, 2)}

Edges:
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
                
                // Save it back to the workspace
                const gridLayoutPath = join(dirname(dbPath), "grid_layout.json");
                writeFileSync(gridLayoutPath, JSON.stringify(layoutData, null, 2));

                return res.json({ assignments: layoutAssignments });
            } catch (e) {
                return res.status(500).json({ error: "AI returned invalid JSON", raw: responseText });
            }
          } catch (error: any) {
            return res.status(500).json({ error: error.message || "Internal server error" });
          }
      });

      // 4. Fallback for React Router / SPA
      app.get("*", (req, res) => {
          res.sendFile(join(uiPath, "index.html"));
      });

      app.listen(port, () => {
        console.log(`\n🟢 Chomp Local Server running on http://localhost:${port}`);
        console.log(`\nTo view your Local Transit Board, open your browser to:`);
        console.log(`👉 http://localhost:${port}\n`);
      });
    });
}
