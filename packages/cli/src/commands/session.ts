import { Command } from "commander";
import { existsSync, readFileSync, statSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { readRegistry, writeRegistry, Session, EntityCounts } from "../utils/registry.js";
import { createBranch, commitChanges } from "../utils/git.js";
import { findWorkspaceRoot } from "../utils/db.js";
import { analyzeTarget, initDatabase, saveRepresentationGraph, getRepresentationGraph } from "@chomp/core";

function getExtractorVersion(workspaceRoot: string): string {
  const pkgPath = resolve(workspaceRoot, "packages/core/package.json");
  if (!existsSync(pkgPath)) {
    throw new Error("Could not find packages/core/package.json");
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  return pkg.version;
}

function formatDateId(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function runAnalyzeProgrammatically(repoName: string, workspaceRoot: string): EntityCounts {
  const targetPath = resolve(workspaceRoot, `fixtures/cloned-repos/${repoName}`);
  const dbPath = resolve(workspaceRoot, `fixtures/cloned-repos/${repoName}.db`);
  const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

  if (!existsSync(targetPath)) {
    throw new Error(`Target repository not found at: ${targetPath}`);
  }

  // Remove old DB if it exists
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }

  console.log(`Analyzing structural entities in: ${targetPath}...`);
  const graph = analyzeTarget(targetPath);

  const db = initDatabase(dbPath);
  const repoInfo = {
    id: repoId,
    name: repoName,
    path: targetPath,
  };

  saveRepresentationGraph(db, repoInfo, graph);
  const savedGraph = getRepresentationGraph(db, repoId) ?? graph;
  db.close();

  return {
    BOUNDARY: savedGraph.boundaries.length,
    CONTRACT: savedGraph.contracts.length,
    RELATIONSHIP: savedGraph.relationships.length,
    OPEN_CONNECTOR: savedGraph.openConnectors.length,
  };
}

function getDbEntityCounts(repoName: string, workspaceRoot: string): EntityCounts {
  const dbPath = resolve(workspaceRoot, `fixtures/cloned-repos/${repoName}.db`);
  const repoId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const db = initDatabase(dbPath);
  const graph = getRepresentationGraph(db, repoId);
  db.close();
  
  if (!graph) {
    throw new Error(`Graph not found in DB for repo: ${repoId}`);
  }

  return {
    BOUNDARY: graph.boundaries.length,
    CONTRACT: graph.contracts.length,
    RELATIONSHIP: graph.relationships.length,
    OPEN_CONNECTOR: graph.openConnectors.length,
  };
}

export function registerSessionCommand(program: Command) {
  const sessionCmd = program.command("session").description("Manage research loop sessions");

  sessionCmd
    .command("start")
    .description("Start a new research session")
    .requiredOption("--repo <name>", "Repository name to analyze")
    .option("--force", "Force start a new session even if a completed session with same extractor version exists")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const registryPath = resolve(workspaceRoot, "fixtures/research/registry.json");
      
      const registry = readRegistry(registryPath);
      const repoName = options.repo;
      
      if (!registry.repos || !registry.repos[repoName]) {
        console.error(`Repository ${repoName} not found in registry.json.`);
        process.exit(1);
      }

      const currentVersion = getExtractorVersion(workspaceRoot);
      const repoSessions = registry.repos[repoName].sessions || [];
      registry.repos[repoName].sessions = repoSessions;
      
      // Stage 0 Guard
      if (!options.force) {
        const lastComplete = [...repoSessions].reverse().find(s => s.status === "COMPLETE" && s.extractor_version === currentVersion);
        if (lastComplete) {
          console.error(`⚠️ A completed session (${lastComplete.session_id}) already ran against this repo with extractor v${currentVersion}.`);
          console.error(`Running again is likely to produce identical results unless the source files have changed.`);
          console.error(`Run with --force to override and start anyway.`);
          process.exit(1);
        }
      }

      // Check freshness
      const mostRecentSession = repoSessions[repoSessions.length - 1];
      const dbPath = resolve(workspaceRoot, `fixtures/cloned-repos/${repoName}.db`);
      let counts: EntityCounts;
      let fresh = false;

      if (mostRecentSession && existsSync(dbPath)) {
        const dbStat = statSync(dbPath);
        const lastSessionDate = new Date(mostRecentSession.date);
        
        if (dbStat.mtime > lastSessionDate && mostRecentSession.extractor_version === currentVersion) {
          fresh = true;
        }
      }

      if (fresh) {
        console.log(`✅ DB is up-to-date (extractor v${currentVersion}). Reusing existing extraction results.`);
        counts = getDbEntityCounts(repoName, workspaceRoot);
      } else {
        counts = runAnalyzeProgrammatically(repoName, workspaceRoot);
      }

      const now = new Date();
      const dateId = formatDateId(now);
      const sessionId = `${dateId}-${repoName}`;
      const branchName = `research/${repoName}-${dateId}`;
      const reportPath = `fixtures/research/sessions/${sessionId}.md`;

      const newSession: Session = {
        session_id: sessionId,
        branch: branchName,
        date: now.toISOString(), // simplified standard ISO date
        extractor_version: currentVersion,
        report_path: reportPath,
        entity_counts: {
          before: counts,
          after: { BOUNDARY: 0, CONTRACT: 0, RELATIONSHIP: 0, OPEN_CONNECTOR: 0 }
        },
        gaps_logged: 0,
        gaps_resolved: 0,
        status: "IN_PROGRESS"
      };

      registry.repos[repoName].sessions.push(newSession);

      // Create branch
      console.log(`Creating branch: ${branchName}`);
      createBranch(branchName, workspaceRoot);

      // Create report stub
      const reportAbsPath = resolve(workspaceRoot, reportPath);
      const reportDir = dirname(reportAbsPath);
      if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });

      const reportStub = `# Research Session: ${repoName} — ${dateId}

## Target
- Repo: ${registry.repos[repoName].url || "<url>"}
- Pinned commit: ${registry.repos[repoName].pinned_commit || "<short SHA>"}
- Extractor version: ${currentVersion}
- Branch: ${branchName}

## Extraction Baseline
| Primitive      | Count |
|---|---|
| BOUNDARY       | ${counts.BOUNDARY}   |
| CONTRACT       | ${counts.CONTRACT}   |
| RELATIONSHIP   | ${counts.RELATIONSHIP}   |
| OPEN_CONNECTOR | ${counts.OPEN_CONNECTOR}   |

---
<!-- Stage 1 content will be appended below -->
`;
      writeFileSync(reportAbsPath, reportStub, "utf8");

      writeRegistry(registryPath, registry);
      
      commitChanges(["fixtures/research/registry.json", reportPath], `research(${repoName}): session ${sessionId} — setup`, workspaceRoot);

      console.log(`\n**Session \`${sessionId}\` — Setup Complete**`);
      console.log(`Branch: \`${branchName}\``);
      console.log(`Proceeding to gap analysis...`);
    });

  sessionCmd
    .command("log-gaps")
    .description("Log discovered gaps in a session")
    .requiredOption("--repo <name>", "Repository name")
    .requiredOption("--count <number>", "Number of gaps logged")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const registryPath = resolve(workspaceRoot, "fixtures/research/registry.json");
      const registry = readRegistry(registryPath);
      
      const session = [...(registry.repos[options.repo].sessions || [])].reverse().find((s: any) => s.status === "IN_PROGRESS");
      if (!session) {
        console.error(`No IN_PROGRESS session found for repo ${options.repo}`);
        process.exit(1);
      }

      session.gaps_logged = parseInt(options.count, 10);
      writeRegistry(registryPath, registry);

      commitChanges(["fixtures/research/registry.json", session.report_path], `research(${options.repo}): session ${session.session_id} — gap analysis complete`, workspaceRoot);
      console.log(`Logged ${options.count} gaps. Committed session report.`);
    });

  sessionCmd
    .command("close")
    .description("Close a research session and record final results")
    .requiredOption("--repo <name>", "Repository name")
    .requiredOption("--resolved <number>", "Number of gaps resolved")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const registryPath = resolve(workspaceRoot, "fixtures/research/registry.json");
      const registry = readRegistry(registryPath);
      
      const session = [...(registry.repos[options.repo].sessions || [])].reverse().find((s: any) => s.status === "IN_PROGRESS");
      if (!session) {
        console.error(`No IN_PROGRESS session found for repo ${options.repo}`);
        process.exit(1);
      }

      const counts = runAnalyzeProgrammatically(options.repo, workspaceRoot);
      
      session.entity_counts.after = counts;
      session.gaps_resolved = parseInt(options.resolved, 10);
      session.status = "COMPLETE";

      writeRegistry(registryPath, registry);

      commitChanges(["fixtures/research/registry.json", session.report_path], `research(${options.repo}): session ${session.session_id} complete — see ${session.report_path}`, workspaceRoot);
      console.log(`Session ${session.session_id} closed.`);
    });
}
