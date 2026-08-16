import { Command } from "commander";
import { existsSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { readRegistry, writeRegistry, SystemAudit } from "../utils/registry.js";
import { createBranch, commitChanges, checkoutBranch, mergeBranch, pushBranch } from "../utils/git.js";
import { findWorkspaceRoot } from "../utils/db.js";

function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

import { initDatabase, getRepresentationGraph } from "@chomp/core";
import { resolveDbPath } from "../utils/db.js";

export function registerAuditCommand(program: Command) {
  const auditCmd = program.command("audit").description("Manage system architecture audits");

  auditCmd
    .command("prepare")
    .description("Prepare an extraction snapshot for the AI Oracle")
    .requiredOption("--repo <name>", "Repository ID/Name to export")
    .option("--db <path>", "Path to SQLite database file")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      
      const dbPath = resolveDbPath(baseDir, options.db);
      if (!existsSync(dbPath)) {
        console.error(`Database not found: ${dbPath}`);
        process.exit(1);
      }
      
      const db = initDatabase(dbPath);
      const graph = getRepresentationGraph(db, options.repo);
      db.close();
      
      if (!graph) {
        console.error(`Repository '${options.repo}' not found in database.`);
        process.exit(1);
      }
      
      const dateStr = formatDate(new Date());
      const sessionId = `${options.repo}-${dateStr}`;
      const handoffDir = resolve(workspaceRoot, `fixtures/research/handoffs/${sessionId}`);
      
      if (!existsSync(handoffDir)) mkdirSync(handoffDir, { recursive: true });
      
      const extractionPath = resolve(handoffDir, "current_extraction.json");
      writeFileSync(extractionPath, JSON.stringify(graph, null, 2), "utf8");
      
      const systemPromptPath = resolve(handoffDir, "system_prompt.md");
      const systemPrompt = `# Chomp Oracle System Instructions

You are the Chomp Oracle. Your objective is to find 'Missing Evidence' and 'Architectural Evolutions' in a dataset. 
You will be provided with a JSON list of extracted code primitives (current_extraction.json) and the raw source code they were extracted from. Compare them based on the provided Ideal Schema.

1. **GAPS**: Report any structural fact found in the code that is entirely missing from the JSON.
2. **EVOLUTIONS**: If the current primitives are insufficient to represent the architecture, suggest Data Additions (e.g., new metadata fields, new relationship types).

Your output MUST be a strict JSON array conforming to this schema, with no markdown code block wrapping:
[
  {
    "discovery_type": "GAP | EVOLUTION",
    "file": "string",
    "line": "number",
    "pattern": "string",
    "snippet": "string",
    "impact": "HIGH | MEDIUM",
    "suggested_evolution": {
      "field_name": "string (e.g., 'parent_scope', 'http_method', etc.)",
      "suggested_value": "any",
      "reasoning": "Why this specific data is required to complete the structural picture"
    },
    "rationale": "Oracle's architectural justification for this discovery"
  }
]`;
      writeFileSync(systemPromptPath, systemPrompt, "utf8");
      
      console.log(`\n**Audit Prepare Complete**`);
      console.log(`Handoff session prepared at: fixtures/research/handoffs/${sessionId}`);
      console.log(`- current_extraction.json created`);
      console.log(`- system_prompt.md created`);
    });

  auditCmd
    .command("start")
    .description("Start a new system audit session")
    .requiredOption("--topic <name>", "Kebab-case topic name for the audit")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      
      const now = new Date();
      const dateStr = formatDate(now);
      const auditId = `${dateStr}-${options.topic}`;
      const branchName = `audit/${auditId}`;
      const reportPath = `fixtures/research/system-audits/${auditId}.md`;
      const reportAbsPath = resolve(workspaceRoot, reportPath);

      console.log(`Creating branch: ${branchName}`);
      createBranch(branchName, workspaceRoot);

      const reportDir = dirname(reportAbsPath);
      if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });

      const reportStub = `# System Audit: ${options.topic}

## Goal

## Identified Gaps

## Proposed Changes

## Changes
<!-- Agent will list exact changes made -->
`;
      writeFileSync(reportAbsPath, reportStub, "utf8");

      commitChanges([reportPath], `audit(${options.topic}): begin system audit — setup`, workspaceRoot);

      console.log(`\n**Audit \`${auditId}\` — Setup Complete**`);
      console.log(`Branch: \`${branchName}\``);
      console.log(`Report created at: \`${reportPath}\``);
      console.log(`Proceeding to evaluation...`);
    });

  auditCmd
    .command("close")
    .description("Close a system audit and log to registry")
    .requiredOption("--topic <name>", "Kebab-case topic name for the audit")
    .requiredOption("--change <items...>", "List of changes made during the audit")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const registryPath = resolve(workspaceRoot, "fixtures/research/registry.json");
      const registry = readRegistry(registryPath);
      
      if (!registry.system_audits) {
        registry.system_audits = [];
      }

      const now = new Date();
      const dateStr = formatDate(now);
      // Construct the ID. If the audit took multiple days, it's safer to find the branch name or existing report.
      // But per spec, ID is YYYY-MM-DD-<topic>. We will assume it is closed on the same day it was started,
      // or we can just try to find the markdown file to be sure.
      let auditId = `${dateStr}-${options.topic}`;
      let reportPath = `fixtures/research/system-audits/${auditId}.md`;
      let reportAbsPath = resolve(workspaceRoot, reportPath);

      // Simple fallback: If today's report doesn't exist, try to find an existing one for this topic.
      if (!existsSync(reportAbsPath)) {
          console.error(`Warning: Could not find report at ${reportPath}. The ID might be from a different date.`);
          // To be safe, we just use the current date ID. 
      }

      const newAudit: SystemAudit = {
        id: auditId,
        date: now.toISOString(),
        summary_path: reportPath,
        changes: options.change
      };

      registry.system_audits.push(newAudit);
      writeRegistry(registryPath, registry);

      commitChanges(["fixtures/research/registry.json", reportPath], `audit(${options.topic}): complete system audit`, workspaceRoot);
      console.log(`Audit ${auditId} closed and logged to registry.`);
    });

  auditCmd
    .command("merge")
    .description("Merge a completed system audit back to main and bump version")
    .requiredOption("--topic <name>", "Kebab-case topic name for the audit")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const registryPath = resolve(workspaceRoot, "fixtures/research/registry.json");
      const registry = readRegistry(registryPath);
      
      const audit = [...(registry.system_audits || [])].reverse().find((a: any) => a.id.endsWith(`-${options.topic}`));
      if (!audit) {
        console.error(`No completed audit found for topic ${options.topic}`);
        process.exit(1);
      }

      const branchName = `audit/${audit.id}`;

      console.log(`Pushing branch ${branchName} to remote...`);
      try {
        pushBranch(branchName, workspaceRoot);
      } catch (e: any) {
        console.warn(`⚠️ Could not push branch ${branchName} to remote. Continuing with local merge...`);
      }

      console.log(`Checking out main...`);
      checkoutBranch("main", workspaceRoot);

      console.log(`Merging ${branchName} into main...`);
      mergeBranch(branchName, `audit(${options.topic}): merge audit ${audit.id}`, workspaceRoot);

      console.log(`Bumping @chomp/core version...`);
      execSync("npm version patch --no-git-tag-version --prefix packages/core", { cwd: workspaceRoot, stdio: 'inherit' });
      
      const pkgPath = resolve(workspaceRoot, "packages/core/package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      const newVersion = pkg.version;
      
      commitChanges(["packages/core/package.json"], `chore: bump @chomp/core to ${newVersion} — audit ${audit.id}`, workspaceRoot);
      console.log(`✅ Bumped version to ${newVersion} and committed.`);
    });
}
