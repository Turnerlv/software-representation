#!/usr/bin/env tsx
// packages/cli/src/index.ts
// Chomp CLI entry point. Defines the 'analyze' and 'ledger' commands using commander.

import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { Command } from "commander";
import {
  analyzeTarget,
  getAllLedgerEntries,
  getLedgerSummary,
  getRepresentationGraph,
  initDatabase,
  saveRepresentationGraph,
  StructuralEntity,
} from "@chomp/core";

/**
 * Walks up the directory tree from startDir until it finds a directory containing
 * pnpm-workspace.yaml. Returns that directory as the monorepo root.
 *
 * Falls back to startDir if no workspace root is found (e.g. running outside the monorepo).
 */
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

/**
 * Resolves the SQLite database path.
 *
 * If --db is passed explicitly, it is resolved relative to the invocation directory.
 * Otherwise, defaults to the canonical workspace database at apps/backend/data/chomp.db.
 */
function resolveDbPath(baseDir: string, optionDb?: string): string {
  if (optionDb) {
    return resolve(baseDir, optionDb);
  }
  const workspaceRoot = findWorkspaceRoot(baseDir);
  return resolve(workspaceRoot, "apps/backend/data/chomp.db");
}

const program = new Command();

// ─── analyze command ────────────────────────────────────────────────────────
// Runs the extraction pipeline on a repo, persists the graph to SQLite,
// and prints a summary table of all extracted structural entities.
program
  .name("chomp")
  .description("Chomp CLI - Software Representation Engine")
  .command("analyze <path>")
  .description("Analyze a TypeScript/JavaScript source file or directory")
  .option("--db <path>", "Path to SQLite database file (default: apps/backend/data/chomp.db)")
  .action((inputPath: string, options: { db?: string }) => {
    const baseDir = process.env.INIT_CWD ?? process.cwd();
    const targetPath = resolve(baseDir, inputPath);

    const isFile = existsSync(targetPath) && statSync(targetPath).isFile();
    const repoPath = isFile ? dirname(targetPath) : targetPath;
    const repoName = basename(repoPath) || "repository";
    const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

    console.log(`Analyzing structural entities in: ${targetPath}...`);
    const graph = analyzeTarget(targetPath);

    const dbPath = resolveDbPath(baseDir, options.db);
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

// ─── ledger command ─────────────────────────────────────────────────────────
// Reads the extractor_coverage_ledger table and prints a breakdown of
// unhandled AST patterns by status, framework, and impact level.
program
  .command("ledger")
  .description("Display the extractor coverage ledger from chomp.db")
  .option("--db <path>", "Path to SQLite database file (default: apps/backend/data/chomp.db)")
  .action((options: { db?: string }) => {
    const baseDir = process.env.INIT_CWD ?? process.cwd();
    const dbPath = resolveDbPath(baseDir, options.db);

    if (!existsSync(dbPath)) {
      console.log(`Database file not found at: ${dbPath}`);
      return;
    }

    const db = initDatabase(dbPath);
    const summary = getLedgerSummary(db);
    const entries = getAllLedgerEntries(db);
    db.close();

    console.log(`\n=== Extractor Coverage Ledger (${dbPath}) ===\n`);
    console.log(`Total Patterns: ${summary.totalPatterns}`);
    console.log(`Resolved: ${summary.resolvedCount} (${summary.resolvedPercentage}%)\n`);

    console.log("Status Breakdown:");
    console.table(
      Object.entries(summary.byStatus).map(([status, count]) => ({
        Status: status,
        Count: count,
      }))
    );

    console.log("\nFramework Breakdown:");
    console.table(
      Object.entries(summary.byFramework).map(([framework, count]) => ({
        Framework: framework,
        Count: count,
      }))
    );

    console.log("\nImpact Level Breakdown:");
    console.table(
      Object.entries(summary.byImpactLevel).map(([level, count]) => ({
        "Impact Level": level,
        Count: count,
      }))
    );

    console.log("\nCoverage Entries:");
    if (entries.length === 0) {
      console.log("No extraction gaps logged in ledger.");
    } else {
      const summaryTable = entries.map((entry) => ({
        ID: entry.id,
        Pattern: entry.patternName,
        Framework: entry.framework,
        Status: entry.status,
        Impact: entry.impactLevel,
        Repo: entry.evidenceRepo,
        File: entry.evidenceFile,
        Line: entry.evidenceLine ?? "-",
        "Fix Location": entry.fixLocation ?? "-",
      }));

      console.table(summaryTable);
    }
  });

program.parse(process.argv);

