import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Command } from "commander";
import { initDatabase, getLedgerSummary, getAllLedgerEntries, logExtractionGap } from "@chomp/core";
import { readRegistry } from "../utils/registry.js";
import {
  initPatternLedger,
  logPattern,
  resolvePattern,
  getAllPatterns,
  getPatternSummary,
  updatePatternStatus,
  OntologyCategory,
  PatternStatus,
} from "@chomp/core";
import {
  initBugTracker,
  logBug,
  updateBugStatus,
  getAllBugs,
  getOpenBugs,
  getBugSummary,
  BugStatus,
} from "@chomp/core";
import { resolveDbPath, findWorkspaceRoot } from "../utils/db.js";

function resolvePatternLedgerPath(workspaceRoot: string): string {
  return resolve(workspaceRoot, "fixtures/research/pattern_ledger.db");
}

function resolveBugTrackerPath(workspaceRoot: string): string {
  return resolve(workspaceRoot, "fixtures/research/bug_tracker.db");
}

function appendToSessionReportById(workspaceRoot: string, sessionId: string | undefined, message: string) {
  if (!sessionId) return;
  try {
    const registry = readRegistry(resolve(workspaceRoot, "fixtures/research/registry.json"));
    let targetSession: any = null;
    for (const repo of Object.values(registry.repos)) {
      targetSession = (repo as any).sessions?.find((s: any) => s.session_id === sessionId);
      if (targetSession) break;
    }
    if (targetSession && targetSession.report_path) {
      const reportAbsPath = resolve(workspaceRoot, targetSession.report_path);
      if (existsSync(reportAbsPath)) {
        appendFileSync(reportAbsPath, `- 📝 [Ledger] ${message}\n`, "utf8");
      }
    }
  } catch (e) {
    // silently fail if we can't write to the report
  }
}


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

  // ── Pattern Ledger subcommands ─────────────────────────────────────────────

  const patternCmd = ledgerCmd.command("pattern").description("Manage the Pattern Ledger (coverage gaps)");

  patternCmd
    .command("list")
    .alias("ls")
    .description("List all pattern classes in the Pattern Ledger")
    .action(() => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initPatternLedger(resolvePatternLedgerPath(workspaceRoot));
      const patterns = getAllPatterns(db);
      const summary = getPatternSummary(db);
      db.close();

      console.log(`\n=== Pattern Ledger (${patterns.length} patterns) ===\n`);
      if (patterns.length === 0) {
        console.log("No patterns registered. Use `chomp ledger pattern log` to add one.");
        return;
      }
      console.table(patterns.map(p => ({
        "ID": p.pattern_id,
        "Category": p.ontology_category,
        "Status": p.status,
        "Occurrences": p.occurrence_count,
        "Has Signature": p.detection_signature ? "✅" : "—",
        "Description": p.description.slice(0, 60) + (p.description.length > 60 ? "…" : ""),
      })));
      console.log(`\nSummary: total=${summary.total} unhandled=${summary.by_status.unhandled} partial=${summary.by_status.partial} handled=${summary.by_status.handled}`);
    });

  patternCmd
    .command("log")
    .description("Register a new pattern class in the Pattern Ledger")
    .requiredOption("--id <slug>", "Stable pattern slug (e.g. export.cjs-property-assignment)")
    .requiredOption("--ontology <category>", "Ontology category: BOUNDARY | CONTRACT | RELATIONSHIP | OPEN_CONNECTOR")
    .requiredOption("--desc <text>", "Human-readable description of the pattern shape")
    .option("--sig <regex>", "ripgrep detection signature for Phase 1 sweeps")
    .option("--repo <name>", "Repo where this pattern was first seen")
    .option("--session <id>", "Session ID where this pattern was first seen")
    .option("--file <path>", "File where this pattern was first seen")
    .option("--line <number>", "Line number where this pattern was first seen")
    .option("--status <status>", "Initial status (default: unhandled)", "unhandled")
    .action((options) => {
      const validCategories: OntologyCategory[] = ["BOUNDARY", "CONTRACT", "RELATIONSHIP", "OPEN_CONNECTOR"];
      if (!validCategories.includes(options.ontology as OntologyCategory)) {
        console.error(`Invalid ontology category: ${options.ontology}`);
        console.error(`Valid values: ${validCategories.join(" | ")}`);
        process.exit(1);
      }
      const validStatuses: PatternStatus[] = ["unhandled", "partial", "handled"];
      if (!validStatuses.includes(options.status as PatternStatus)) {
        console.error(`Invalid status: ${options.status}. Valid: ${validStatuses.join(" | ")}`);
        process.exit(1);
      }

      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initPatternLedger(resolvePatternLedgerPath(workspaceRoot));

      try {
        const entry = logPattern(db, {
          pattern_id: options.id,
          ontology_category: options.ontology as OntologyCategory,
          description: options.desc,
          detection_signature: options.sig ?? null,
          status: options.status as PatternStatus,
          first_seen_repo: options.repo ?? null,
          first_seen_session_id: options.session ?? null,
          first_seen_file: options.file ?? null,
          first_seen_line: options.line ? parseInt(options.line, 10) : null,
        });
        console.log(`✅ Pattern logged: ${entry.pattern_id} [${entry.status}]`);
        appendToSessionReportById(workspaceRoot, options.session, `Logged new pattern: \`${entry.pattern_id}\` (${entry.ontology_category}) -> ${entry.status}`);
      } catch (err: any) {
        if (err.message?.includes("UNIQUE constraint failed")) {
          console.error(`Pattern '${options.id}' already exists. Use 'chomp ledger pattern resolve' to update it.`);
        } else {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
      } finally {
        db.close();
      }
    });

  patternCmd
    .command("resolve")
    .description("Mark a pattern as handled (resolved by a fix session)")
    .requiredOption("--id <slug>", "Pattern ID to resolve")
    .requiredOption("--session <id>", "Session ID that fixed this pattern")
    .option("--commit <sha>", "Git commit SHA of the fix")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initPatternLedger(resolvePatternLedgerPath(workspaceRoot));

      const entry = resolvePattern(db, options.id, options.session, options.commit);
      db.close();

      if (!entry) {
        console.error(`Pattern '${options.id}' not found in the Pattern Ledger.`);
        process.exit(1);
      }
      console.log(`✅ Pattern resolved: ${entry.pattern_id} → handled (session: ${options.session})`);
      appendToSessionReportById(workspaceRoot, options.session, `Resolved pattern: \`${entry.pattern_id}\` -> handled`);
    });

  patternCmd
    .command("status")
    .description("Update the status of a pattern without resolving it")
    .requiredOption("--id <slug>", "Pattern ID")
    .requiredOption("--status <status>", "New status: unhandled | partial | handled")
    .action((options) => {
      const validStatuses: PatternStatus[] = ["unhandled", "partial", "handled"];
      if (!validStatuses.includes(options.status as PatternStatus)) {
        console.error(`Invalid status: ${options.status}`);
        process.exit(1);
      }
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initPatternLedger(resolvePatternLedgerPath(workspaceRoot));
      updatePatternStatus(db, options.id, options.status as PatternStatus);
      db.close();
      console.log(`✅ Pattern '${options.id}' status → ${options.status}`);
    });

  // Also register `chomp ledger patterns` as an alias for `chomp ledger pattern list`
  ledgerCmd
    .command("patterns")
    .description("Alias: list all pattern classes (same as `ledger pattern list`)")
    .action(() => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initPatternLedger(resolvePatternLedgerPath(workspaceRoot));
      const patterns = getAllPatterns(db);
      const summary = getPatternSummary(db);
      db.close();

      console.log(`\n=== Pattern Ledger (${patterns.length} patterns) ===\n`);
      if (patterns.length === 0) {
        console.log("No patterns registered. Use `chomp ledger pattern log` to add one.");
        return;
      }
      console.table(patterns.map(p => ({
        "ID": p.pattern_id,
        "Category": p.ontology_category,
        "Status": p.status,
        "Occurrences": p.occurrence_count,
        "Sig": p.detection_signature ? "✅" : "—",
        "Description": p.description.slice(0, 55) + (p.description.length > 55 ? "…" : ""),
      })));
      console.log(`\nSummary: unhandled=${summary.by_status.unhandled} partial=${summary.by_status.partial} handled=${summary.by_status.handled}`);
    });

  // ── Bug Tracker subcommands ────────────────────────────────────────────────

  const bugCmd = ledgerCmd.command("bug").description("Manage the Bug Tracker (correctness defects)");

  bugCmd
    .command("list")
    .alias("ls")
    .description("List all bugs in the Bug Tracker")
    .option("--open-only", "Show only open and investigating bugs")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initBugTracker(resolveBugTrackerPath(workspaceRoot));
      const bugs = options.openOnly ? getOpenBugs(db) : getAllBugs(db);
      const summary = getBugSummary(db);
      db.close();

      console.log(`\n=== Bug Tracker (${summary.total} total) ===\n`);
      if (bugs.length === 0) {
        console.log(options.openOnly ? "No open bugs. 🎉" : "No bugs logged.");
        return;
      }
      console.table(bugs.map(b => ({
        "ID": b.bug_id,
        "Status": b.status,
        "Repo": b.repo,
        "File": b.file,
        "Line": b.line ?? "—",
        "Session": b.found_session_id,
        "Description": b.description.slice(0, 55) + (b.description.length > 55 ? "…" : ""),
      })));
      console.log(`\nopen=${summary.by_status.open} investigating=${summary.by_status.investigating} fixed=${summary.by_status.fixed} wontfix=${summary.by_status.wontfix}`);
    });

  bugCmd
    .command("log")
    .description("Log a new correctness defect in the Bug Tracker")
    .requiredOption("--id <slug>", "Stable bug slug")
    .requiredOption("--desc <text>", "Description of the defect")
    .requiredOption("--repo <name>", "Repository where the bug was found")
    .requiredOption("--file <path>", "File where the bug was found")
    .requiredOption("--session <id>", "Session ID where the bug was found")
    .option("--line <number>", "Line number")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initBugTracker(resolveBugTrackerPath(workspaceRoot));

      try {
        const entry = logBug(db, {
          bug_id: options.id,
          description: options.desc,
          repo: options.repo,
          file: options.file,
          line: options.line ? parseInt(options.line, 10) : null,
          found_session_id: options.session,
        });
        console.log(`✅ Bug logged: ${entry.bug_id} [${entry.status}]`);
        appendToSessionReportById(workspaceRoot, options.session, `Logged correctness defect: \`${entry.bug_id}\``);
      } catch (err: any) {
        if (err.message?.includes("UNIQUE constraint failed")) {
          console.error(`Bug '${options.id}' already exists.`);
        } else {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
      } finally {
        db.close();
      }
    });

  bugCmd
    .command("fix")
    .description("Mark a bug as fixed")
    .requiredOption("--id <slug>", "Bug ID")
    .requiredOption("--session <id>", "Session ID that fixed this bug")
    .option("--commit <sha>", "Git commit SHA of the fix")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initBugTracker(resolveBugTrackerPath(workspaceRoot));

      const entry = updateBugStatus(db, options.id, "fixed", options.session, options.commit);
      db.close();

      if (!entry) {
        console.error(`Bug '${options.id}' not found.`);
        process.exit(1);
      }
      console.log(`✅ Bug fixed: ${entry.bug_id} (session: ${options.session})`);
      appendToSessionReportById(workspaceRoot, options.session, `Fixed defect: \`${entry.bug_id}\``);
    });

  bugCmd
    .command("status")
    .description("Update a bug's status")
    .requiredOption("--id <slug>", "Bug ID")
    .requiredOption("--status <status>", "New status: open | investigating | fixed | wontfix")
    .option("--session <id>", "Session ID (required when status=fixed)")
    .option("--commit <sha>", "Git commit SHA")
    .action((options) => {
      const validStatuses: BugStatus[] = ["open", "investigating", "fixed", "wontfix"];
      if (!validStatuses.includes(options.status as BugStatus)) {
        console.error(`Invalid status: ${options.status}`);
        process.exit(1);
      }
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initBugTracker(resolveBugTrackerPath(workspaceRoot));
      updateBugStatus(db, options.id, options.status as BugStatus, options.session, options.commit);
      db.close();
      console.log(`✅ Bug '${options.id}' → ${options.status}`);
    });

  // Also register `chomp ledger bugs` as an alias for `chomp ledger bug list`
  ledgerCmd
    .command("bugs")
    .description("Alias: list all bugs (same as `ledger bug list`)")
    .option("--open-only", "Show only open and investigating bugs")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const db = initBugTracker(resolveBugTrackerPath(workspaceRoot));
      const bugs = options.openOnly ? getOpenBugs(db) : getAllBugs(db);
      const summary = getBugSummary(db);
      db.close();

      console.log(`\n=== Bug Tracker (${summary.total} total) ===\n`);
      if (bugs.length === 0) {
        console.log(options.openOnly ? "No open bugs. 🎉" : "No bugs logged.");
        return;
      }
      console.table(bugs.map(b => ({
        "ID": b.bug_id,
        "Status": b.status,
        "Repo": b.repo,
        "File": b.file,
        "Line": b.line ?? "—",
        "Description": b.description.slice(0, 55) + (b.description.length > 55 ? "…" : ""),
      })));
    });
}
