import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { findWorkspaceRoot } from "./utils/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: bridge-analysis.ts <repo-name>");
    process.exit(1);
  }
  const repoName = args[0];

  const baseDir = process.env.INIT_CWD ?? process.cwd();
  const workspaceRoot = findWorkspaceRoot(baseDir);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const handoffDir = resolve(workspaceRoot, `fixtures/research/handoffs/${repoName}-${dateStr}`);
  const extractionPath = resolve(handoffDir, "current_extraction.json");
  const systemPromptPath = resolve(handoffDir, "system_prompt.md");

  if (!existsSync(extractionPath) || !existsSync(systemPromptPath)) {
    console.error(`Missing handoff files in ${handoffDir}`);
    process.exit(1);
  }

  const extractionJson = readFileSync(extractionPath, "utf8");
  const systemPrompt = readFileSync(systemPromptPath, "utf8");
  const ledgerPath = resolve(workspaceRoot, ".context/SR_ledger_2.1.md");
  const idealPath = resolve(workspaceRoot, ".context/chomp_extraction_ideal.md");
  
  const ledger = existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : "";
  const ideal = existsSync(idealPath) ? readFileSync(idealPath, "utf8") : "";

  console.log(`Sending Deep Analysis request for ${repoName}...`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing in .env");
    process.exit(1);
  }

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

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const reportDir = resolve(workspaceRoot, "fixtures/research/analysis");
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, `${repoName}-${dateStr}.md`);

  writeFileSync(reportPath, responseText, "utf8");
  console.log(`Analysis complete. Saved to ${reportPath}`);
}

main().catch(console.error);
