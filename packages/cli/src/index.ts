#!/usr/bin/env tsx
// packages/cli/src/index.ts
// Chomp CLI entry point.

// Load .env from the package root, anchored to this file's location so it
// works whether invoked via `pnpm --filter @chomp/cli dev` from the repo root
// or directly from inside packages/cli/.
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '../.env') }); // packages/cli/.env

import { Command } from "commander";
import { registerAnalyzeCommand } from "./commands/analyze.js";
import { registerHealthCommand } from "./commands/health.js";
import { registerMcpCommand } from './commands/mcp.js';
import { registerPushCommand } from "./commands/push.js";
import { registerAuthCommand } from "./commands/auth.js";
import { registerUiCommand } from "./commands/ui.js";
import { registerDiffCommand } from "./commands/diff.js";

const program = new Command();

program
  .name("chomp")
  .description("Chomp CLI - Software Representation Engine");

registerAnalyzeCommand(program);
registerHealthCommand(program);
registerMcpCommand(program);
registerPushCommand(program);
registerAuthCommand(program);
registerUiCommand(program);
registerDiffCommand(program);

program.parse(process.argv);
