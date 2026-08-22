import { existsSync, statSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { Command } from "commander";
import {
  analyzeTarget,
  StructuralEntity,
} from "@chomp/core";
import { createSQLiteStorage } from "@chomp/db";
import { resolveDbPath } from "../utils/db.js";

export function registerAnalyzeCommand(program: Command) {
  program
    .command("analyze <path>")
    .description("Analyze a TypeScript/JavaScript source file or directory")
    .option("--db <path>", "Path to SQLite database file (default: fixtures/cloned-repos/<repoName>.db)")
    .action(async (inputPath: string, options: { db?: string }) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const targetPath = resolve(baseDir, inputPath);

      if (!existsSync(targetPath)) {
        console.error(`Error: Path does not exist: ${targetPath}`);
        process.exit(1);
      }

      const stat = statSync(targetPath);
      const isDir = stat.isDirectory();
      const repoName = isDir ? basename(targetPath) : basename(dirname(targetPath));
      const repoPath = isDir ? targetPath : dirname(targetPath);
      const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

      console.log(`Analyzing structural entities in: ${targetPath}...`);
      const graph = analyzeTarget(targetPath);

      const defaultDbDir = resolve(repoPath, ".chomp");
      if (!existsSync(defaultDbDir)) {
        mkdirSync(defaultDbDir, { recursive: true });
      }
      const dbPath = options.db 
        ? resolve(baseDir, options.db)
        : resolve(defaultDbDir, "graph.db");
      const storage = createSQLiteStorage(dbPath);

      const repoInfo = {
        id: repoId,
        name: repoName,
        path: repoPath,
      };

      await storage.saveRepresentationGraph(repoInfo, graph);

      const savedGraph = await storage.getRepresentationGraph(repoId) ?? graph;
      await storage.close();

      const allEntities = [
        ...savedGraph.nodes,
        ...savedGraph.edges,
      ];

      console.log(`\nSuccessfully saved structural representation to: ${dbPath}\n`);
      console.log(`Repository: ${repoName} (${repoId})`);
      console.log(`Analyzed At: ${savedGraph.analyzedAt}`);
      console.log(`Total Entities Found: ${allEntities.length}\n`);

      const summaryTable = allEntities.map((entity) => {
        const ev = Array.isArray(entity.evidence) ? entity.evidence[0] : entity.evidence;
        return {
          Type: entity.type,
          ID: entity.id,
          Name: entity.name,
          File: ev?.filePath ?? "-",
          Line: ev?.lineNumber ?? "-",
          Snippet: ev?.snippet
            ? ev.snippet.length > 40
              ? `${ev.snippet.slice(0, 37)}...`
              : ev.snippet
            : "-",
        };
      });

      console.table(summaryTable);
    });
}
