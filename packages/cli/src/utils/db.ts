/**
 * @fileoverview Utility functions for resolving monorepo workspace hierarchy and database paths.
 *
 * Provides helper functions used across CLI commands to locate project roots,
 * monorepo workspace boundaries, and default database file locations.
 *
 * @module @chomp/cli/utils/db
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Traverses upwards from a given starting directory to locate the root of a pnpm monorepo workspace.
 *
 * Evaluates each parent directory in the filesystem hierarchy for the presence of `pnpm-workspace.yaml`.
 * If the filesystem root is reached without finding a workspace definition file, the function falls
 * back to returning the provided `startDir`.
 *
 * @param startDir - The directory path from which to begin the upward search.
 * @returns The directory path containing `pnpm-workspace.yaml`, or `startDir` if no workspace configuration is located.
 *
 * @example
 * ```ts
 * const workspaceRoot = findWorkspaceRoot(process.cwd());
 * console.log(`Monorepo root: ${workspaceRoot}`);
 * ```
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

