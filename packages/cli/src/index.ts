import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Command } from "commander";
import {
  analyzeTarget,
  getRepresentationGraph,
  initDatabase,
  saveRepresentationGraph,
  StructuralEntity,
} from "@chomp/core";

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = dirname(current);
  }
  return startDir;
}

const program = new Command();

program
  .name("chomp")
  .description("Chomp CLI - Software Representation Engine")
  .command("analyze <path>")
  .description("Analyze a TypeScript/JavaScript source file or directory")
  .action((inputPath: string) => {
    const baseDir = process.env.INIT_CWD ?? process.cwd();
    const targetPath = resolve(baseDir, inputPath);

    const isFile = existsSync(targetPath) && statSync(targetPath).isFile();
    const repoPath = isFile ? dirname(targetPath) : targetPath;
    const repoName = basename(repoPath) || "repository";
    const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

    console.log(`Analyzing structural entities in: ${targetPath}...`);
    const graph = analyzeTarget(targetPath);

    const workspaceRoot = findWorkspaceRoot(baseDir);
    const dbPath = resolve(workspaceRoot, "apps/backend/data/chomp.db");
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

    const summaryTable = allEntities.map((entity) => ({
      Type: entity.type,
      ID: entity.id,
      Name: entity.name,
      File: entity.evidence.filePath,
      Line: entity.evidence.lineNumber ?? "-",
      Snippet: entity.evidence.snippet
        ? entity.evidence.snippet.length > 40
          ? `${entity.evidence.snippet.slice(0, 37)}...`
          : entity.evidence.snippet
        : "-",
    }));

    console.table(summaryTable);
  });

program.parse(process.argv);
