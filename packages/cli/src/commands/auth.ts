import { Command } from "commander";

export function registerAuthCommand(program: Command) {
  program
    .command("auth")
    .description("Authenticate with chomp.app")
    .action(() => {
      console.log("Auth command executed (stub)");
    });
}
