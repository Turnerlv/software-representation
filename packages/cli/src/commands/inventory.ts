// packages/cli/src/commands/inventory.ts
//
// `chomp inventory --repo <name>`
//
// Phase 1 of the v4 research loop: a fully deterministic, zero-LLM pattern sweep.
// For every pattern in the Pattern Ledger that has a detection_signature, runs ripgrep
// against the target repo and counts occurrences. Updates occurrence_count in the ledger.
//
// Health gate is called first — aborts if the graph is structurally unsound.
//
// Output: a human-readable table showing per-pattern occurrence counts and actionability flags.
// Exit code 0 = sweep completed (regardless of what was found).
// Exit code 1 = health check failed or repo not found.

import { Command } from "commander";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { findWorkspaceRoot } from "../utils/db.js";
import {
  initPatternLedger,
  getSweepablePatterns,
  getAllPatterns,
  updatePatternOccurrence,
  getPatternSummary,
  PatternEntry,
} from "@chomp/core";

function resolvePatternLedgerPath(workspaceRoot: string): string {
  return resolve(workspaceRoot, "fixtures/research/pattern_ledger.db");
}

function runRipgrepCount(pattern: string, targetDir: string): number {
  // Use ripgrep for fast deterministic count.
  // Falls back to grep if rg is not available.
  const rg = spawnSync("rg", [
    "--count-matches",
    "--no-heading",
    "-e", pattern,
    targetDir,
  ], { encoding: "utf8" });

  if (rg.status === null && rg.error) {
    // rg not found — fall back to grep
    const grep = spawnSync("grep", [
      "-r",
      "-E",
      "--include=*.ts",
      "--include=*.js",
      "-c",
      pattern,
      targetDir,
    ], { encoding: "utf8" });

    return sumCountLines(grep.stdout ?? "");
  }

  // rg exit code 1 = no matches (not an error)
  if (rg.status === 1) return 0;
  if (rg.status !== 0) return 0;

  return sumCountLines(rg.stdout ?? "");
}

function sumCountLines(output: string): number {
  return output.split("\n")
    .filter(Boolean)
    .reduce((sum, line) => {
      // Each line is "filepath:count" or just "count"
      const parts = line.split(":");
      const countStr = parts[parts.length - 1];
      const n = parseInt(countStr, 10);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
}

export function registerInventoryCommand(program: Command) {
  program
    .command("inventory")
    .description(
      "Phase 1 sweep: deterministically count known pattern occurrences in a repo (no LLM)"
    )
    .requiredOption("--repo <name>", "Repository name (must exist under fixtures/cloned-repos/)")
    .option("--skip-health", "Skip the health gate (use only for debugging)")
    .action((options: { repo: string; skipHealth?: boolean }) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const repoName = options.repo;

      const targetPath = resolve(workspaceRoot, `fixtures/cloned-repos/${repoName}`);
      if (!existsSync(targetPath) || !statSync(targetPath).isDirectory()) {
        console.error(`\nError: Repository not found at ${targetPath}`);
        console.error(`Clone it first: git clone <url> fixtures/cloned-repos/${repoName}`);
        process.exit(1);
      }

      // ── Health gate ───────────────────────────────────────────────────────
      if (!options.skipHealth) {
        console.log(`\nRunning health gate for ${repoName}...`);
        try {
          execSync(
            `pnpm chomp health --repo fixtures/cloned-repos/${repoName}`,
            { stdio: "inherit", cwd: workspaceRoot }
          );
        } catch {
          console.error("\n❌ Health check failed. Aborting inventory sweep.");
          console.error("   Fix extraction issues first, or use --skip-health to bypass (debugging only).");
          process.exit(1);
        }
        console.log();
      } else {
        console.warn("⚠️  --skip-health: health gate bypassed. Results may be unreliable.");
      }

      // ── Load pattern ledger ───────────────────────────────────────────────
      const ledgerPath = resolvePatternLedgerPath(workspaceRoot);
      const db = initPatternLedger(ledgerPath);
      const sweepable = getSweepablePatterns(db);
      const all = getAllPatterns(db);

      if (all.length === 0) {
        console.log("Pattern ledger is empty. Add patterns with:");
        console.log("  pnpm chomp ledger pattern log --id <slug> --ontology <cat> --desc <text> --sig <regex>");
        db.close();
        return;
      }

      if (sweepable.length === 0) {
        console.log(`\n${all.length} pattern(s) registered but none have a detection_signature.`);
        console.log("Add --sig to a pattern to make it sweepable:");
        console.log("  pnpm chomp ledger pattern log --id <slug> --ontology <cat> --desc <text> --sig <regex>");
        db.close();
        return;
      }

      // ── Sweep ────────────────────────────────────────────────────────────
      console.log(`\n=== Pattern Inventory Sweep: ${repoName} ===`);
      console.log(`Sweeping ${sweepable.length} of ${all.length} patterns (those with detection signatures)...\n`);

      const results: Array<{
        "Pattern ID": string;
        "Ontology": string;
        "Status": string;
        "Occurrences": number;
        "Flag": string;
      }> = [];

      let newCandidates = 0;

      for (const pattern of sweepable) {
        const count = runRipgrepCount(pattern.detection_signature!, targetPath);
        updatePatternOccurrence(db, pattern.pattern_id, count);

        let flag = "";
        if (count === 0) {
          flag = "— repo doesn't exercise this shape";
        } else if (pattern.status === "unhandled") {
          flag = "⚠️  UNHANDLED — target for comparison session";
          newCandidates++;
        } else if (pattern.status === "partial") {
          flag = "🔶 PARTIAL — may need further comparison";
        }

        results.push({
          "Pattern ID": pattern.pattern_id,
          "Ontology": pattern.ontology_category,
          "Status": pattern.status,
          "Occurrences": count,
          "Flag": flag,
        });
      }

      console.table(results);

      // ── Patterns without signatures ────────────────────────────────────────
      const unsweepable = all.filter(p => !p.detection_signature);
      if (unsweepable.length > 0) {
        console.log(`\n⚠️  ${unsweepable.length} pattern(s) skipped (no detection_signature):`);
        for (const p of unsweepable) {
          console.log(`   ${p.pattern_id} [${p.status}]`);
        }
      }

      // ── Summary ────────────────────────────────────────────────────────────
      const summary = getPatternSummary(db);
      db.close();

      console.log("\n--- Ledger Summary ---");
      console.log(`Total patterns: ${summary.total}`);
      console.log(`  unhandled: ${summary.by_status.unhandled}  partial: ${summary.by_status.partial}  handled: ${summary.by_status.handled}`);
      console.log(`\nPatterns present in ${repoName} and unhandled: ${newCandidates}`);

      if (newCandidates > 0) {
        console.log("\nNext step — run a comparison session targeting the unhandled patterns:");
        console.log(`  pnpm chomp session start --repo ${repoName} --type comparison`);
      } else {
        console.log("\nNo unhandled patterns found in this repo. Consider:");
        console.log("  - Running against another cloned repo");
        console.log("  - Refining detection signatures for broader coverage");
      }

      // ── Saturation metric (printed for registry logging) ───────────────────
      const newUnhandledWithOccurrences = results.filter(
        r => r["Status"] === "unhandled" && r["Occurrences"] > 0
      ).length;
      const totalSwept = sweepable.length;
      console.log(`\nSaturation: new_candidates=${newUnhandledWithOccurrences} / total_swept=${totalSwept}`);
    });
}
