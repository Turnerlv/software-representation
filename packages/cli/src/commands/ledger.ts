import { existsSync } from "node:fs";
import { Command } from "commander";
import { initDatabase, getLedgerSummary, getAllLedgerEntries } from "@chomp/core";
import { resolveDbPath } from "../utils/db.js";

export function registerLedgerCommand(program: Command) {
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
}
