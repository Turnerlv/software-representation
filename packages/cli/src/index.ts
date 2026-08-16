#!/usr/bin/env tsx
// packages/cli/src/index.ts
// Chomp CLI entry point. Defines the 'analyze', 'ledger', and 'session' commands using commander.

import { Command } from "commander";
import { registerAnalyzeCommand } from "./commands/analyze.js";
import { registerSessionCommand } from "./commands/session.js";
import { registerAuditCommand } from "./commands/audit.js";
import { registerLedgerCommand } from "./commands/ledger.js";
import { registerHealthCommand } from "./commands/health.js";

const program = new Command();

program
  .name("chomp")
  .description("Chomp CLI - Software Representation Engine");

registerAnalyzeCommand(program);
registerSessionCommand(program);
registerAuditCommand(program);
registerLedgerCommand(program);
registerHealthCommand(program);

program.parse(process.argv);
