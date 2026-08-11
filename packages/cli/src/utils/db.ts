import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Walks up the directory tree from startDir until it finds a directory containing
 * pnpm-workspace.yaml. Returns that directory as the monorepo root.
 *
 * Falls back to startDir if no workspace root is found (e.g. running outside the monorepo).
 */
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

/**
 * Resolves the SQLite database path.
 *
 * If optionDb is passed explicitly, it is resolved relative to the baseDir.
 * Otherwise, defaults to the canonical workspace database at apps/backend/data/chomp.db.
 */
export function resolveDbPath(baseDir: string, optionDb?: string): string {
  if (optionDb) {
    return resolve(baseDir, optionDb);
  }
  const workspaceRoot = findWorkspaceRoot(baseDir);
  return resolve(workspaceRoot, "apps/backend/data/chomp.db");
}
