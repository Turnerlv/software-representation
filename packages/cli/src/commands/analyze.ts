import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { Command } from "commander";
import {
  analyzeTarget,
  initDatabase,
  saveRepresentationGraph,
  getRepresentationGraph,
  StructuralEntity,
} from "@chomp/core";
import { resolveDbPath } from "../utils/db.js";

export function registerAnalyzeCommand(program: Command) {
  program
    .command("analyze <path>")
    .description("Analyze a TypeScript/JavaScript source file or directory")
    .option("--db <path>", "Path to SQLite database file (default: fixtures/cloned-repos/<repoName>.db)")
    .action((inputPath: string, options: { db?: string }) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const targetPath = resolve(baseDir, inputPath);

      const isFile = existsSync(targetPath) && statSync(targetPath).isFile();
      const repoPath = isFile ? dirname(targetPath) : targetPath;
      const repoName = basename(repoPath) || "repository";
      const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

      console.log(`Analyzing structural entities in: ${targetPath}...`);
      const graph = analyzeTarget(targetPath);

      const dbPath = options.db 
        ? resolve(baseDir, options.db)
        : resolve(baseDir, `fixtures/cloned-repos/${repoName}.db`);
      const db = initDatabase(dbPath);

      const repoInfo = {
        id: repoId,
        name: repoName,
        path: repoPath,
      };

      saveRepresentationGraph(db, repoInfo, graph);

      const savedGraph = getRepresentationGraph(db, repoId) ?? graph;
      db.close();

      const allEntities: StructuralEntity[] = [
        ...savedGraph.boundaries,
        ...savedGraph.contracts,
        ...savedGraph.relationships,
        ...savedGraph.openConnectors,
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
