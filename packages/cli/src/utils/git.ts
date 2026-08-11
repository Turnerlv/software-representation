import { execSync } from "node:child_process";

export function execGit(command: string, cwd: string): string {
  try {
    return execSync(`git ${command}`, { cwd, encoding: "utf8" }).trim();
  } catch (error: any) {
    throw new Error(`Git command failed: git ${command}\n${error.message}`);
  }
}

export function createBranch(branchName: string, cwd: string) {
  execGit(`checkout -b ${branchName}`, cwd);
}

export function commitChanges(files: string[], message: string, cwd: string) {
  execGit(`add ${files.join(" ")}`, cwd);
  // Using single quotes for message to prevent shell issues, but we should be careful with quotes in message.
  // We'll replace single quotes with '"'"' to safely escape in bash if needed, but safer to use an array or just simple messages.
  const safeMessage = message.replace(/'/g, "'\\''");
  execGit(`commit -m '${safeMessage}'`, cwd);
}
