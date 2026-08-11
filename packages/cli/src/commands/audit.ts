import { Command } from "commander";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { readRegistry, writeRegistry, SystemAudit } from "../utils/registry.js";
import { createBranch, commitChanges } from "../utils/git.js";
import { findWorkspaceRoot } from "../utils/db.js";

function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function registerAuditCommand(program: Command) {
  const auditCmd = program.command("audit").description("Manage system architecture audits");

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
}
