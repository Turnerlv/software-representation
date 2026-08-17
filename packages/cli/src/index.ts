#!/usr/bin/env tsx
// packages/cli/src/index.ts
// Chomp CLI entry point.

import { Command } from "commander";
import { registerAnalyzeCommand } from "./commands/analyze.js";
import { registerSessionCommand } from "./commands/session.js";
import { registerAuditCommand } from "./commands/audit.js";
import { registerLedgerCommand } from "./commands/ledger.js";
import { registerHealthCommand } from "./commands/health.js";
import { registerInventoryCommand } from "./commands/inventory.js";

const program = new Command();

program
  .name("chomp")
  .description("Chomp CLI - Software Representation Engine");

registerAnalyzeCommand(program);
registerSessionCommand(program);
registerAuditCommand(program);
registerLedgerCommand(program);
registerHealthCommand(program);
registerInventoryCommand(program);

program.parse(process.argv);
