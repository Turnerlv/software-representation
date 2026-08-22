#!/usr/bin/env tsx
// packages/cli/src/index.ts
// Chomp CLI entry point.

import { Command } from "commander";
import { registerAnalyzeCommand } from "./commands/analyze.js";
import { registerHealthCommand } from "./commands/health.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerPushCommand } from "./commands/push.js";
import { registerAuthCommand } from "./commands/auth.js";

const program = new Command();

program
  .name("chomp")
  .description("Chomp CLI - Software Representation Engine");

registerAnalyzeCommand(program);
registerHealthCommand(program);
registerMcpCommand(program);
registerPushCommand(program);
registerAuthCommand(program);

program.parse(process.argv);
