import { Command } from "commander";

export function registerMcpCommand(program: Command) {
  program
    .command("mcp")
    .description("Start the MCP server")
    .action(() => {
      console.log("MCP server started (stub)");
    });
}
