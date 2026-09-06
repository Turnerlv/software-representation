import { Command } from "commander";
import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { createSQLiteStorage } from "@chomp/db";

export function registerUiCommand(program: Command): void {
  program
    .command("ui")
    .description("Start the local Chomp server and open the Guest View")
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
      
      // Allow the cloud hosted UI to fetch this data
      app.use(cors({
        origin: ['http://localhost:3000', 'https://app.chomp.dev'],
        methods: ['GET', 'POST'],
      }));
      
      app.use(express.json());

      app.get("/api/graph", async (req, res) => {
        try {
          const storage = createSQLiteStorage(dbPath);
          const repos = await storage.listRepositories();
          
          if (repos.length === 0) {
            await storage.close();
            return res.status(404).json({ error: "No repositories found in database." });
          }

          // In local mode, the DB usually only has one repo. We grab the first one.
          const targetRepoId = repos[0].id;
          const graph = await storage.getRepresentationGraph(targetRepoId);
          await storage.close();
          
          if (!graph) {
            return res.status(404).json({ error: "Graph not found for this repository." });
          }
          
          res.json(graph);
        } catch (error) {
          console.error("Error fetching graph:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      });

      app.get("/api/status", async (req, res) => {
        try {
          const storage = createSQLiteStorage(dbPath);
          const repos = await storage.listRepositories();
          await storage.close();
          
          if (repos.length === 0) {
            return res.json({ status: "empty", version: "1.0.0" });
          }
          
          const targetRepo = repos[0];
          res.json({ status: "ok", repoId: targetRepo.id, repoName: targetRepo.name, version: "1.0.0" });
        } catch (error) {
          res.status(500).json({ error: "Internal server error" });
        }
      });

      app.listen(port, () => {
        console.log(`\n🟢 Chomp Local Server running on http://localhost:${port}`);
        console.log(`\nTo view your graph, open your browser to:`);
        console.log(`👉 http://localhost:3000/local?port=${port}\n`); // Update to app.chomp.dev later
      });
    });
}
