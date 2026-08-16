import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { findWorkspaceRoot } from "./utils/db.js";

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

  console.log(`Connecting to Gemini API (gemini-1.5-pro-latest)...`);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    systemInstruction: systemPrompt,
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  try {
    console.log("Analyzing extracted primitives against the Chomp Ideal Schema...");
    const result = await model.generateContent(`Here is the current extraction:\n\n${extractionData}\n\nPlease identify any GAPS or EVOLUTIONS.`);
    
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
