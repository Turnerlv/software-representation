/**
 * @fileoverview CLI command implementation for deterministic AST analysis and representation graph generation.
 *
 * The `analyze` command parses a given TypeScript or JavaScript source file or directory,
 * extracts structural nodes (Boundaries, Contracts, Open Connectors) and edges (Relationships),
 * persists the resulting Representation Graph into an SQLite database, and prints
 * an evidence summary table to the console.
 *
 * @module @chomp/cli/commands/analyze
 */

import { existsSync, statSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { Command } from "commander";
import { analyzeTarget } from "@chomp/core";
import { createSQLiteStorage } from "@chomp/db";

/**
 * Registers the `analyze` command on the Commander program instance.
 *
 * @param program - The Commander CLI program instance to attach the command to.
 *
 * @remarks
 * Command Usage:
 * ```bash
 * chomp analyze <path> [--db <dbPath>]
 * ```
 *
 * Arguments:
 * - `<path>`: Relative or absolute path to the target source file or directory to parse.
 *
 * Options:
 * - `--db <path>`: Optional custom file path for the SQLite storage database. Defaults to `<repoPath>/.chomp/graph.db`.
 *
 * Process Flow:
 * 1. Resolves target path against current working directory.
 * 2. Derives repository metadata (identifier, name, root path).
 * 3. Invokes `@chomp/core` deterministic AST extractor (`analyzeTarget`).
 * 4. Initializes SQLite storage via `@chomp/db` (`createSQLiteStorage`).
 * 5. Persists the structural graph (`saveRepresentationGraph`).
 * 6. Renders a summary table containing entity types, IDs, names, and source-code evidence traceability.
 *
 * Exit Codes:
 * - `0`: Analysis completed and representation graph saved successfully.
 * - `1`: Specified target path does not exist on disk.
 *
 * @example
 * ```ts
 * import { Command } from "commander";
 * import { registerAnalyzeCommand } from "./commands/analyze.js";
 *
 * const program = new Command();
 * registerAnalyzeCommand(program);
 * program.parse(process.argv);
 * ```
 */
export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze <path>")
    .description("Analyze a TypeScript/JavaScript source file or directory")
    .option("--db <path>", "Path to SQLite database file (default: <path>/.chomp/graph.db)")
    .action(async (inputPath: string, options: { db?: string }) => {
      // Resolve target path relative to initial working directory or cwd
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const targetPath = resolve(baseDir, inputPath);

      if (!existsSync(targetPath)) {
        console.error(`Error: Path does not exist: ${targetPath}`);
        process.exit(1);
      }

      // Determine repository name, root directory, and sanitized identifier
      const stat = statSync(targetPath);
      const isDir = stat.isDirectory();
      const repoName = isDir ? basename(targetPath) : basename(dirname(targetPath));
      const repoPath = isDir ? targetPath : dirname(targetPath);
      const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

      console.log(`Analyzing structural entities in: ${targetPath}...`);
      const graph = analyzeTarget(targetPath);

      // Initialize persistent SQLite storage location
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

      // Persist the extracted representation graph
      await storage.saveRepresentationGraph(repoInfo, graph);

      const savedGraph = (await storage.getRepresentationGraph(repoId)) ?? graph;
      await storage.close();

      const allEntities = [
        ...savedGraph.nodes,
        ...savedGraph.edges,
      ];

      console.log(`\nSuccessfully saved structural representation to: ${dbPath}\n`);
      console.log(`Repository: ${repoName} (${repoId})`);
      console.log(`Analyzed At: ${savedGraph.analyzedAt}`);
      console.log(`Total Entities Found: ${allEntities.length}\n`);

      // Format summary table with line-level evidence traceability
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
