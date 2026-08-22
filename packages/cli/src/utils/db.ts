import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import os from "node:os";
import fs from "node:fs";

export function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = dirname(current);
  }
  return startDir;
}

export function resolveDbPath(baseDir: string, optionDb?: string): string {
  if (optionDb) {
    return resolve(baseDir, optionDb);
  }
  const defaultDir = join(os.homedir(), ".chomp");
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return join(defaultDir, "chomp.db");
}
