import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { execSync } from "node:child_process";
import { findWorkspaceRoot, resolveDbPath } from "../utils/db.js";
import { analyzeTarget, initDatabase, saveRepresentationGraph, getRepresentationGraph, StructuralEntity } from "@chomp/core";
import { GoogleGenerativeAI } from "@google/generative-ai";

function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function execGit(command: string, cwd: string): string {
  try {
    return execSync(`git ${command}`, { cwd, encoding: "utf8" }).trim();
  } catch (error: any) {
    throw new Error(`Git command failed: git ${command}\n${error.message}`);
  }
}

export function registerResearchCommand(program: Command) {
  const researchCmd = program.command("research").description("Manage research and deep analysis loops");

  researchCmd
    .command("start")
    .description("Start a research loop by validating health, extracting to DBs, and creating a handoff")
    .requiredOption("--repo <name>", "Name of the cloned repository to research")
    .action((options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      
      const repoName = options.repo;
      const targetPath = resolve(workspaceRoot, `fixtures/cloned-repos/${repoName}`);

      if (!existsSync(targetPath)) {
        console.error(`Repository not found at ${targetPath}`);
        process.exit(1);
      }
      
      const registryPath = resolve(workspaceRoot, "fixtures/research/registry.json");
      if (!existsSync(registryPath)) {
        console.error(`Registry not found at ${registryPath}`);
        process.exit(1);
      }
      
      const registry = JSON.parse(readFileSync(registryPath, "utf8"));
      if (!registry.repos || !registry.repos[repoName]) {
        console.error(`Repository ${repoName} is not registered in registry.json`);
        process.exit(1);
      }

      console.log(`Running health checks for ${repoName}...`);
      try {
        execSync(`pnpm chomp health --repo fixtures/cloned-repos/${repoName}`, { stdio: "inherit", cwd: workspaceRoot });
      } catch (error) {
        console.error(`\nHealth check failed. Aborting research start.`);
        process.exit(1);
      }

      const branchName = `analysis/${repoName}-${formatDateTime(new Date())}`;
      console.log(`\nCreating branch: ${branchName}`);
      execGit(`checkout -b ${branchName}`, workspaceRoot);

      console.log(`Running full extraction...`);
      const graph = analyzeTarget(targetPath);
      
      const repoInfo = {
        id: repoName.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
        name: repoName,
        path: targetPath,
      };

      // 1. Isolated DB
      const isolatedDbPath = resolve(workspaceRoot, `fixtures/cloned-repos/${repoName}.db`);
      const isolatedDb = initDatabase(isolatedDbPath);
      saveRepresentationGraph(isolatedDb, repoInfo, graph);
      isolatedDb.close();

      // 2. Central DB
      const centralDbPath = resolve(workspaceRoot, "apps/backend/data/chomp.db");
      const centralDb = initDatabase(centralDbPath);
      saveRepresentationGraph(centralDb, repoInfo, graph);
      centralDb.close();
      
      console.log(`Saved representations to ${isolatedDbPath} and ${centralDbPath}`);

      // Handoff prep
      const dateStr = formatDate(new Date());
      const sessionId = `${repoName}-${dateStr}`;
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

Never make up missing links if the code does not explicitly support it.
`;
      writeFileSync(systemPromptPath, systemPrompt, "utf8");

      console.log(`Committing handoff snapshot...`);
      execGit(`add ${handoffDir}`, workspaceRoot);
      execGit(`commit -m "Research handoff for ${repoName}"`, workspaceRoot);
      
      console.log(`\nResearch session started successfully!`);
      console.log(`Branch: ${branchName}`);
      console.log(`Handoff Path: ${handoffDir}`);
      console.log(`\nReview the handoff payload and proceed with 'chomp research close --repo ${repoName}' when ready.`);
    });

  researchCmd
    .command("close")
    .description("Complete a research loop by calling Gemini, saving the report, cleaning up, and merging")
    .requiredOption("--repo <name>", "Name of the cloned repository to close")
    .option("--branch <branch>", "Specific branch to use (defaults to today's handoff)")
    .action(async (options) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const workspaceRoot = findWorkspaceRoot(baseDir);
      const repoName = options.repo;
      
      const dateStr = formatDate(new Date());
      const sessionId = options.branch ? options.branch.replace("analysis/", "") : `${repoName}-${dateStr}`;
      const handoffDir = resolve(workspaceRoot, `fixtures/research/handoffs/${sessionId}`);
      
      if (!existsSync(handoffDir)) {
        console.error(`Handoff directory not found: ${handoffDir}`);
        process.exit(1);
      }
      
      const extractionPath = resolve(handoffDir, "current_extraction.json");
      const systemPromptPath = resolve(handoffDir, "system_prompt.md");

      if (!existsSync(extractionPath) || !existsSync(systemPromptPath)) {
        console.error(`Missing handoff files in ${handoffDir}`);
        process.exit(1);
      }

      console.log(`Preparing Deep Analysis for ${repoName}...`);
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("GEMINI_API_KEY is missing in .env");
        process.exit(1);
      }
      
      const extractionJson = readFileSync(extractionPath, "utf8");
      const systemPrompt = readFileSync(systemPromptPath, "utf8");
      const ledgerPath = resolve(workspaceRoot, ".context/SR_ledger_2.1.md");
      const idealPath = resolve(workspaceRoot, ".context/chomp_extraction_ideal.md");
      
      const ledger = existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : "";
      const ideal = existsSync(idealPath) ? readFileSync(idealPath, "utf8") : "";

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-pro" });

      const prompt = `
System Prompt:
${systemPrompt}

Ledger Context:
${ledger}

Ideal Extraction Context:
${ideal}

Current Extraction Data:
${extractionJson}

Please generate the deep analysis markdown report according to the SKILL format.
`;
      
      console.log("Calling Gemini API...");
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      const reportDir = resolve(workspaceRoot, "fixtures/research/analysis");
      if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
      const reportPath = resolve(reportDir, `${sessionId}.md`);

      writeFileSync(reportPath, responseText, "utf8");
      console.log(`Saved analysis report to ${reportPath}`);

      console.log("Cleaning up handoff directory...");
      // Remove files and then directory directly instead of rmSync with recursive to support older nodes if needed
      // Actually node 14+ supports rmSync. Using it.
      rmSync(handoffDir, { recursive: true, force: true });

      const registryPath = resolve(workspaceRoot, "fixtures/research/registry.json");
      const registry = JSON.parse(readFileSync(registryPath, "utf8"));
      
      if (!registry.repos) registry.repos = {};
      if (!registry.repos[repoName]) {
        registry.repos[repoName] = {};
      }
      if (!registry.repos[repoName].analyses) {
        registry.repos[repoName].analyses = [];
      }
      
      const currentBranch = execGit(`rev-parse --abbrev-ref HEAD`, workspaceRoot);
      
      registry.repos[repoName].analyses.push({
        date: dateStr,
        branch: currentBranch,
        report_path: `fixtures/research/analysis/${sessionId}.md`,
        health_snapshot: { connectivity_rate: 100.0, scope_purity: 100.0 }, // placeholder - could parse from health run later
        key_findings: ["Analysis completed automatically"]
      });
      
      writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', "utf8");
      console.log(`Updated registry.json`);
      
      console.log("Committing report and registry...");
      execGit(`add ${reportPath} fixtures/research/registry.json`, workspaceRoot);
      execGit(`commit -m "Add analysis report for ${repoName}"`, workspaceRoot);
      
      console.log(`Merging ${currentBranch} into main...`);
      execGit(`checkout main`, workspaceRoot);
      execGit(`merge --no-ff ${currentBranch} -m "Merge research analysis for ${repoName}"`, workspaceRoot);
      
      console.log(`\nResearch loop closed successfully!`);
    });
}
