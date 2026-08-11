#!/usr/bin/env tsx
// packages/cli/src/index.ts
// Chomp CLI entry point. Defines the 'analyze', 'ledger', and 'session' commands using commander.

import { Command } from "commander";
import { registerAnalyzeCommand } from "./commands/analyze.js";
import { registerLedgerCommand } from "./commands/ledger.js";
import { registerSessionCommand } from "./commands/session.js";

const program = new Command();

program
  .name("chomp")
  .description("Chomp CLI - Software Representation Engine");

registerAnalyzeCommand(program);
registerLedgerCommand(program);
registerSessionCommand(program);

program.parse(process.argv);
