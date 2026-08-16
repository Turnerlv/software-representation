import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Command } from "commander";
import { initDatabase, getLedgerSummary, getAllLedgerEntries, logExtractionGap } from "@chomp/core";
import { resolveDbPath } from "../utils/db.js";

export function registerLedgerCommand(program: Command) {
  const ledgerCmd = program
    .command("ledger")
    .description("Display or manage the extractor coverage ledger")
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

  ledgerCmd
    .command("import")
    .description("Import Oracle Discovery Notes (JSON) into the ledger")
    .requiredOption("--file <path>", "Path to studio_output.json")
    .requiredOption("--repo <name>", "Repository name (to associate evidence)")
    .option("--db <path>", "Path to SQLite database file")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const dbPath = resolveDbPath(baseDir, options.db);
      
      let data: any[];
      try {
        const fileContent = readFileSync(resolve(baseDir, options.file), "utf8");
        data = JSON.parse(fileContent);
      } catch (err: any) {
        console.error(`Failed to read or parse input JSON: ${err.message}`);
        process.exit(1);
      }
      
      const db = initDatabase(dbPath);
      let importedCount = 0;
      
      for (const item of data) {
        const hash = createHash("sha256")
          .update(`${item.file}:${item.line}:${item.pattern}`)
          .digest("hex")
          .substring(0, 8);
        const gapId = `gap_${hash}`;
        
        try {
          logExtractionGap(db, {
            id: gapId,
            patternName: item.pattern || "Unknown Pattern",
            framework: "Unknown", 
            impactLevel: item.impact as any || "MEDIUM",
            evidenceRepo: options.repo,
            evidenceFile: item.file || "unknown",
            evidenceLine: item.line ? parseInt(item.line, 10) : null,
            evidenceSnippet: item.snippet || null,
            discoveryType: item.discovery_type as any,
            suggestedEvolution: item.suggested_evolution,
            rationale: item.rationale
          });
          importedCount++;
          console.log(`Imported Discovery Note: ${gapId} (${item.discovery_type})`);
        } catch (err: any) {
          if (err.message && err.message.includes("UNIQUE constraint failed")) {
             console.log(`Note ${gapId} already exists in ledger. Skipping.`);
          } else {
             console.error(`Error logging note ${gapId}: ${err.message}`);
          }
        }
      }
      db.close();
      console.log(`\n✅ Successfully imported ${importedCount} Discovery Notes into ledger.`);
    });

  ledgerCmd
    .command("log")
    .description("Log an extraction gap deterministically")
    .requiredOption("--repo <name>", "Evidence repository name")
    .requiredOption("--file <path>", "Evidence file path")
    .requiredOption("--line <number>", "Evidence line number")
    .requiredOption("--pattern <name>", "Pattern name")
    .requiredOption("--framework <name>", "Framework")
    .requiredOption("--impact <level>", "Impact level (HIGH|MEDIUM|LOW)")
    .requiredOption("--snippet <text>", "Evidence snippet")
    .option("--db <path>", "Path to SQLite database file")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const dbPath = resolveDbPath(baseDir, options.db);
      const db = initDatabase(dbPath);
      
      const hash = createHash("sha256")
        .update(`${options.file}:${options.line}:${options.pattern}`)
        .digest("hex")
        .substring(0, 8);
      const gapId = `gap_${hash}`;

      try {
        logExtractionGap(db, {
          id: gapId,
          patternName: options.pattern,
          framework: options.framework,
          impactLevel: options.impact as any,
          evidenceRepo: options.repo,
          evidenceFile: options.file,
          evidenceLine: parseInt(options.line, 10),
          evidenceSnippet: options.snippet
        });
        console.log(`Successfully logged gap: ${gapId}`);
      } catch (err: any) {
        if (err.message && err.message.includes("UNIQUE constraint failed")) {
          console.log(`Gap ${gapId} already exists in the ledger. Skipping duplicate.`);
        } else {
          console.error(`Error logging gap: ${err.message}`);
          process.exit(1);
        }
      } finally {
        db.close();
      }
    });
}
