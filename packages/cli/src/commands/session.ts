import { Command } from "commander";
import { existsSync, readFileSync, statSync, writeFileSync, appendFileSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { readRegistry, writeRegistry, Session, EntityCounts } from "../utils/registry.js";

export type SessionType = "inventory" | "comparison" | "fix";

function buildBranchName(type: SessionType, repoName: string, targetSlug: string | undefined, dateId: string): string {
  switch (type) {
    case "inventory":
      return `research/inventory/${repoName}-${dateId}`;
    case "fix":
      // targetSlug = pattern/bug id being fixed
      return `fix/${targetSlug ?? repoName}-${dateId}`;
    case "comparison":
    default:
      return `research/compare/${repoName}-${targetSlug ? `${targetSlug}-` : ""}${dateId}`;
  }
}
import { createBranch, commitChanges, checkoutBranch, mergeBranch, pushBranch } from "../utils/git.js";
import { findWorkspaceRoot } from "../utils/db.js";
import { analyzeTarget, initDatabase, saveRepresentationGraph, getRepresentationGraph, initPatternLedger, getPattern, initBugTracker, getBug } from "@chomp/core";

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
    .option("--type <type>", "Session type: inventory | comparison | fix (default: comparison)", "comparison")
    .option("--target <slug>", "For comparison: file slug being compared. For fix: pattern/bug ID being fixed.")
    .option("--force", "Force start a new session even if a completed session with same extractor version exists")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const registryPath = resolve(workspaceRoot, "fixtures/research/registry.json");
      
      const registry = readRegistry(registryPath);
      const repoName = options.repo;
      const sessionType: SessionType = options.type ?? "comparison";

      const validTypes: SessionType[] = ["inventory", "comparison", "fix"];
      if (!validTypes.includes(sessionType)) {
        console.error(`Invalid session type: ${sessionType}. Valid: ${validTypes.join(" | ")}`);
        process.exit(1);
      }
      
      if (!registry.repos || !registry.repos[repoName]) {
        console.error(`Repository ${repoName} not found in registry.json.`);
        process.exit(1);
      }

      if (sessionType === "comparison") {
        console.log(`\n[comparison session] Running health gate before starting...`);
        try {
          execSync(
            `pnpm chomp health --repo fixtures/cloned-repos/${options.repo}`,
            { cwd: workspaceRoot, stdio: "inherit" }
          );
        } catch {
          console.error("\n❌ Health check failed. Fix extraction issues before starting a comparison session.");
          process.exit(1);
        }
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
      const branchName = buildBranchName(sessionType, repoName, options.target, dateId);
      const reportPath = `fixtures/research/sessions/v${currentVersion}-${repoName}.md`;

      const newSession: Session & { type?: string; target?: string } = {
        session_id: sessionId,
        branch: branchName,
        date: now.toISOString(),
        extractor_version: currentVersion,
        report_path: reportPath,
        entity_counts: {
          before: counts,
          after: { BOUNDARY: 0, CONTRACT: 0, RELATIONSHIP: 0, OPEN_CONNECTOR: 0 }
        },
        gaps_logged: 0,
        gaps_resolved: 0,
        status: "IN_PROGRESS",
        // v4 fields
        type: sessionType,
        ...(options.target ? { target: options.target } : {}),
      };

      registry.repos[repoName].sessions.push(newSession);

      // Create branch
      console.log(`Creating branch: ${branchName}`);
      createBranch(branchName, workspaceRoot);

      // Create report stub
      const reportAbsPath = resolve(workspaceRoot, reportPath);
      const reportDir = dirname(reportAbsPath);
      if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });

      const typeLabel = sessionType.charAt(0).toUpperCase() + sessionType.slice(1);
      
      if (!existsSync(reportAbsPath)) {
        const header = `# Research Loop: ${repoName} (v${currentVersion})\n\n`;
        writeFileSync(reportAbsPath, header, "utf8");
      }
      
      let targetContext = "";
      if (sessionType === "fix" && options.target) {
        try {
          const patternDb = initPatternLedger(resolve(workspaceRoot, "fixtures/research/pattern_ledger.db"));
          const pattern = getPattern(patternDb, options.target);
          patternDb.close();
          if (pattern) {
            targetContext = `\n### Target Context (Pattern: ${pattern.pattern_id})\n- **Category:** ${pattern.ontology_category}\n- **Status:** ${pattern.status}\n- **Description:** ${pattern.description}\n`;
          } else {
            const bugDb = initBugTracker(resolve(workspaceRoot, "fixtures/research/bug_tracker.db"));
            const bug = getBug(bugDb, options.target);
            bugDb.close();
            if (bug) {
              targetContext = `\n### Target Context (Bug: ${bug.bug_id})\n- **Status:** ${bug.status}\n- **Description:** ${bug.description}\n`;
            }
          }
        } catch (e) {
          // Ignore
        }
      }

      const reportStub = `## ${typeLabel} Session — ${dateId}${
        options.target ? ` (${options.target})` : ""
      }
${targetContext}
- Repo: ${registry.repos[repoName].url || "<url>"}
- Pinned commit: ${registry.repos[repoName].pinned_commit || "<short SHA>"}
- Extractor version: ${currentVersion}
- Branch: ${branchName}

### Extraction Baseline
| Primitive      | Count |
|---|---|
| BOUNDARY       | ${counts.BOUNDARY}   |
| CONTRACT       | ${counts.CONTRACT}   |
| RELATIONSHIP   | ${counts.RELATIONSHIP}   |
| OPEN_CONNECTOR | ${counts.OPEN_CONNECTOR}   |

---
`;
      appendFileSync(reportAbsPath, reportStub, "utf8");

      writeRegistry(registryPath, registry);
      
      commitChanges(["fixtures/research/registry.json", reportPath], `research(${repoName}): ${sessionType} session ${sessionId} — setup`, workspaceRoot);

      console.log(`\n**Session \`${sessionId}\` [${sessionType}] — Setup Complete**`);
      console.log(`Branch: \`${branchName}\``);
      if (sessionType === "inventory") {
        console.log(`\nNext: run \`pnpm chomp inventory --repo ${repoName}\` to sweep patterns.`);
      } else if (sessionType === "comparison") {
        console.log(`\nNext: compare target file against the rubric. Log findings with \`chomp ledger pattern log\` or \`chomp ledger bug log\`.`);
      } else {
        console.log(`\nNext: implement the fix in packages/core, then run \`pnpm test --filter @chomp/core\`.`);
        console.log(`Close with \`chomp session merge --repo ${repoName}\` — health + tests will be verified before merge.`);
      }
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

  sessionCmd
    .command("merge")
    .description("Merge a completed research session back to main and bump version")
    .requiredOption("--repo <name>", "Repository name")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const registryPath = resolve(workspaceRoot, "fixtures/research/registry.json");
      const registry = readRegistry(registryPath);
      
      const session = [...(registry.repos[options.repo].sessions || [])].reverse().find((s: any) => s.status === "COMPLETE");
      if (!session) {
        console.error(`No COMPLETE session found for repo ${options.repo}`);
        process.exit(1);
      }

      const sessionType: SessionType = session.type ?? "comparison";

      // ── Fix-session merge gate ────────────────────────────────────────────
      // Fix sessions MUST pass health + tests before merging. This is enforced
      // programmatically so a human doesn't have to remember.
      if (sessionType === "fix") {
        console.log("\n[fix session] Running health gate before merge...");
        try {
          const healthOut = execSync(
            `pnpm chomp health --repo fixtures/cloned-repos/${options.repo}`,
            { cwd: workspaceRoot, encoding: "utf8" }
          );
          console.log(healthOut);
          
          const reportAbsPath = resolve(workspaceRoot, session.report_path);
          if (existsSync(reportAbsPath)) {
            appendFileSync(reportAbsPath, `\n### Health Gate (Fix Session Merge)\n\`\`\`\n${healthOut}\n\`\`\`\n---\n`, "utf8");
            commitChanges([session.report_path], `research(${options.repo}): append health check results`, workspaceRoot);
          }
        } catch (e: any) {
          if (e.stdout) console.log(e.stdout);
          if (e.stderr) console.error(e.stderr);
          console.error("\n❌ Health check failed. Fix extraction issues before merging.");
          process.exit(1);
        }

        console.log("\n[fix session] Running @chomp/core tests before merge...");
        try {
          execSync("pnpm test --filter @chomp/core", { stdio: "inherit", cwd: workspaceRoot });
        } catch {
          console.error("\n❌ Tests failed. Fix test failures before merging.");
          process.exit(1);
        }

        console.log("\n✅ Health and tests passed. Proceeding with merge.");
      }

      console.log(`Pushing branch ${session.branch} to remote...`);
      try {
        pushBranch(session.branch, workspaceRoot);
      } catch (e: any) {
        console.warn(`⚠️ Could not push branch ${session.branch} to remote. Continuing with local merge...`);
      }

      console.log(`Checking out main...`);
      checkoutBranch("main", workspaceRoot);

      console.log(`Merging ${session.branch} into main...`);
      mergeBranch(session.branch, `research(${options.repo}): merge ${sessionType} session ${session.session_id}`, workspaceRoot);

      if (session.gaps_resolved > 0 || sessionType === "fix") {
        console.log(`Bumping @chomp/core patch version...`);
        execSync("npm version patch --no-git-tag-version --prefix packages/core", { cwd: workspaceRoot, stdio: 'inherit' });
        
        const newVersion = getExtractorVersion(workspaceRoot);
        commitChanges(["packages/core/package.json"], `chore: bump @chomp/core to ${newVersion} — ${session.session_id}`, workspaceRoot);
        console.log(`✅ Bumped version to ${newVersion} and committed.`);
      } else {
        console.log(`ℹ️ ${sessionType} session — no extractor code changes. Version left at ${getExtractorVersion(workspaceRoot)}.`);
      }
    });
}

