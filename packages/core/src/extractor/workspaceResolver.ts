import fs from 'fs';
import path from 'path';

export interface WorkspaceRegistry {
  [packageName: string]: string; // "@payloadcms/config" -> "/absolute/path/packages/config"
}

/**
 * Builds an in-memory registry mapping workspace package names to their absolute paths.
 * Supports pnpm-workspace.yaml, lerna.json, and package.json workspaces.
 * 
 * @param repoRoot The absolute path of the repository root
 */
export function buildWorkspaceRegistry(repoRoot: string): WorkspaceRegistry {
  const registry: WorkspaceRegistry = {};
  let globs: string[] = [];

  const pnpmWorkspacePath = path.join(repoRoot, 'pnpm-workspace.yaml');
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const lernaJsonPath = path.join(repoRoot, 'lerna.json');

  if (fs.existsSync(pnpmWorkspacePath)) {
    const content = fs.readFileSync(pnpmWorkspacePath, 'utf8');
    globs = parsePnpmWorkspaceGlobs(content);
  } else if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (Array.isArray(pkg.workspaces)) {
        globs = pkg.workspaces;
      }
    } catch (e) {
      // Ignore parse errors
    }
  } else if (fs.existsSync(lernaJsonPath)) {
    try {
      const lerna = JSON.parse(fs.readFileSync(lernaJsonPath, 'utf8'));
      if (Array.isArray(lerna.packages)) {
        globs = lerna.packages;
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // Fallback to common monorepo patterns if nothing explicit is found
  if (globs.length === 0) {
     if (fs.existsSync(path.join(repoRoot, 'packages'))) globs.push('packages/*');
     if (fs.existsSync(path.join(repoRoot, 'apps'))) globs.push('apps/*');
  }

  for (const pattern of globs) {
    const directories = expandSimpleGlob(repoRoot, pattern);
    for (const dir of directories) {
      const pkgJsonPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          if (pkg.name) {
            registry[pkg.name] = dir;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }

  return registry;
}

/**
 * Very rudimentary parser for pnpm-workspace.yaml to extract packages array.
 */
function parsePnpmWorkspaceGlobs(content: string): string[] {
  const globs: string[] = [];
  let inPackages = false;
  
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('packages:')) {
      inPackages = true;
      continue;
    }
    
    if (inPackages) {
      // If it's a new top-level key or un-indented, we left packages
      if (trimmed && !line.startsWith(' ') && !line.startsWith('-')) {
         inPackages = false;
         continue;
      }
      
      if (trimmed.startsWith('-')) {
        let pattern = trimmed.substring(1).trim();
        // Remove quotes
        if ((pattern.startsWith("'") && pattern.endsWith("'")) || 
            (pattern.startsWith('"') && pattern.endsWith('"'))) {
          pattern = pattern.substring(1, pattern.length - 1);
        }
        globs.push(pattern);
      }
    }
  }
  
  return globs;
}

/**
 * Expands simple globs like "packages/*" or "apps/*".
 * Returns absolute paths of matched directories.
 */
function expandSimpleGlob(repoRoot: string, pattern: string): string[] {
  const results: string[] = [];
  // Currently only supports simple trailing asterisk e.g., "packages/*"
  if (pattern.endsWith('/*')) {
    const baseDir = pattern.slice(0, -2);
    const absoluteBase = path.join(repoRoot, baseDir);
    if (fs.existsSync(absoluteBase)) {
      try {
        const entries = fs.readdirSync(absoluteBase, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            results.push(path.join(absoluteBase, entry.name));
          }
        }
      } catch (e) {
        // Ignore read errors
      }
    }
  } else {
    // If it's an exact path
    const exactPath = path.join(repoRoot, pattern);
    if (fs.existsSync(exactPath) && fs.statSync(exactPath).isDirectory()) {
      results.push(exactPath);
    }
  }
  
  return results;
}
