import { Command } from "commander";
import { runMcpServer } from "@chomp/mcp";
import { resolve } from "node:path";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp [path]")
    .description("Start the Chomp MCP Server for Agentic Querying")
    .action(async (inputPath: string | undefined) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const targetPath = inputPath ? resolve(baseDir, inputPath) : baseDir;
      
      await runMcpServer(targetPath);
    });
}
