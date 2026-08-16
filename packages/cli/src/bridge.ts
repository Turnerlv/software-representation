import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import * as dotenv from "dotenv";
import { findWorkspaceRoot } from "./utils/db.js";

function getRepoSourceCode(dir: string): string {
  if (!existsSync(dir)) return "";
  let sourceCode = "";
  function walk(currentDir: string) {
    const files = readdirSync(currentDir);
    for (const file of files) {
      if (['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', 'test', 'tests', 'examples', 'fixtures', 'benchmark'].includes(file)) continue;
      const fullPath = join(currentDir, file);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.tsx'))) {
        try {
          const content = readFileSync(fullPath, "utf8");
          sourceCode += `\n### FILE: ${fullPath.replace(dir, '')}\n\`\`\`\n${content}\n\`\`\`\n`;
        } catch (e) {}
      }
    }
  }
  walk(dir);
  return sourceCode;
}

async function main() {
  const baseDir = process.env.INIT_CWD ?? process.cwd();
  const workspaceRoot = findWorkspaceRoot(baseDir);
  dotenv.config({ path: resolve(workspaceRoot, ".env") });

  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: tsx packages/cli/src/bridge.ts <sessionId>");
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is not set.");
    process.exit(1);
  }

  const handoffDir = resolve(workspaceRoot, `fixtures/research/handoffs/${sessionId}`);
  
  // Extract repo name from session ID (e.g. express-2023-10-25)
  const parts = sessionId.split("-");
  const repoName = parts.slice(0, -3).join("-");
  const repoDir = resolve(workspaceRoot, `fixtures/cloned-repos/${repoName}`);
  
  const extractionPath = resolve(handoffDir, "current_extraction.json");
  const systemPromptPath = resolve(handoffDir, "system_prompt.md");
  const outputPath = resolve(handoffDir, "studio_output.json");

  let extractionData, systemPrompt;
  try {
    extractionData = readFileSync(extractionPath, "utf8");
    systemPrompt = readFileSync(systemPromptPath, "utf8");
  } catch (err: any) {
    console.error(`Error reading handoff files: ${err.message}`);
    process.exit(1);
  }

  let srLedger = "";
  try {
    srLedger = readFileSync(resolve(workspaceRoot, "SR_ledger_2.1.txt"), "utf8");
  } catch (e) {
    try {
      srLedger = readFileSync(resolve(workspaceRoot, ".context/SR_ledger_2.1.md"), "utf8");
    } catch (e2) {}
  }

  let idealSchema = "";
  try {
    idealSchema = readFileSync(resolve(workspaceRoot, ".context/chomp_extraction_ideal.md"), "utf8");
  } catch (e) {}

  const fullSystemInstruction = `
${systemPrompt}

## FOUNDATIONAL PHILOSOPHY (SR LEDGER)
${srLedger}

## CHOMP EXTRACTION IDEAL
${idealSchema}
`;

  const modelName = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
  console.log(`Connecting to Gemini API (${modelName})...`);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: fullSystemInstruction,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const repoSourceCode = getRepoSourceCode(repoDir);

  try {
    console.log(`Analyzing extracted primitives against the Chomp Ideal Schema for repo: ${repoName}...`);
    
    const g = JSON.parse(extractionData);
    function compactPrimitive(p: any) {
      return {
        type: p.type,
        name: p.name,
        file: p.evidence?.filePath ? p.evidence.filePath.replace(/^.*\/fixtures\/cloned-repos\/[^\/]+\//, "") : undefined,
        line: p.evidence?.lineNumber
      };
    }

    const compactGraph = {
      version: g.version,
      boundaries: (g.boundaries || []).map(compactPrimitive),
      contracts: (g.contracts || []).map(compactPrimitive),
      relationships: (g.relationships || []).map(compactPrimitive),
      openConnectors: (g.openConnectors || []).map(compactPrimitive),
    };

    const minifiedExtraction = JSON.stringify(compactGraph);
    const prompt = `
# SOURCE CODE CONTEXT
${repoSourceCode}

# CURRENT EXTRACTION DATA
\`\`\`json
${minifiedExtraction}
\`\`\`

Please identify any GAPS or EVOLUTIONS based on your instructions.
`;

    const result = await model.generateContent(prompt);
    
    const responseText = result.response.text();
    // Validate JSON parsing
    JSON.parse(responseText); 
    
    writeFileSync(outputPath, responseText, "utf8");
    console.log(`✅ Oracle analysis complete. Results saved to: ${outputPath}`);
  } catch (err: any) {
    console.error(`Gemini API Error: ${err.message}`);
    process.exit(1);
  }
}

main();
