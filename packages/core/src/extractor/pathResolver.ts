import path from 'path';
import fs from 'fs';
import { WorkspaceRegistry } from './workspaceResolver.js';

/**
 * Resolves an import literal to a canonical repository-relative path.
 * 
 * @param importLiteral The string path from the import statement (e.g. '../services/user')
 * @param currentFilePath The absolute path of the current file
 * @param repoRoot The absolute path of the repository root
 * @param workspaceRegistry Optional registry of monorepo workspace packages
 * @returns The repository-relative path to the target file, or null if it cannot be resolved.
 */
export function resolveModulePath(
  importLiteral: string, 
  currentFilePath: string, 
  repoRoot: string,
  workspaceRegistry?: WorkspaceRegistry
): string | null {
  
  let targetAbsolutePath: string | null = null;

  if (importLiteral.startsWith('.')) {
    const currentDir = path.dirname(currentFilePath);
    targetAbsolutePath = path.resolve(currentDir, importLiteral);
  } else if (workspaceRegistry) {
    // Check if it's a workspace package or a deep import into a workspace package
    for (const [pkgName, pkgPath] of Object.entries(workspaceRegistry)) {
      if (importLiteral === pkgName || importLiteral.startsWith(`${pkgName}/`)) {
        if (importLiteral === pkgName) {
          // Resolve to package main/exports or index
          const pkgJsonPath = path.join(pkgPath, 'package.json');
          if (fs.existsSync(pkgJsonPath)) {
             try {
               const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
               if (pkg.main) {
                 targetAbsolutePath = path.join(pkgPath, pkg.main);
               } else if (pkg.exports && typeof pkg.exports === 'object') {
                 // Very rudimentary exports resolution (taking the default/require/import)
                 const mainExport = pkg.exports['.'] || pkg.exports;
                 if (typeof mainExport === 'string') {
                   targetAbsolutePath = path.join(pkgPath, mainExport);
                 } else if (mainExport.import || mainExport.require || mainExport.default) {
                   targetAbsolutePath = path.join(pkgPath, mainExport.import || mainExport.require || mainExport.default);
                 }
               }
             } catch(e) {}
          }
          if (!targetAbsolutePath) {
             targetAbsolutePath = path.join(pkgPath, 'index'); // will try extensions below
          }
        } else {
          // Deep import
          const subPath = importLiteral.substring(pkgName.length + 1);
          targetAbsolutePath = path.join(pkgPath, subPath);
        }
        break;
      }
    }
  }

  if (!targetAbsolutePath) {
    return null;
  }
  
  // Try common extensions

  // Handle TypeScript ES module imports where .js implies .ts/.tsx
  if (targetAbsolutePath.endsWith('.js')) {
    const tsPath = targetAbsolutePath.slice(0, -3) + '.ts';
    if (fs.existsSync(tsPath)) return path.relative(repoRoot, tsPath);
    
    const tsxPath = targetAbsolutePath.slice(0, -3) + '.tsx';
    if (fs.existsSync(tsxPath)) return path.relative(repoRoot, tsxPath);
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];

  
  for (const ext of extensions) {
    const checkPath = targetAbsolutePath + ext;
    if (fs.existsSync(checkPath)) {
      return path.relative(repoRoot, checkPath);
    }
  }

  // If it's exactly an existing file
  if (fs.existsSync(targetAbsolutePath) && fs.statSync(targetAbsolutePath).isFile()) {
    return path.relative(repoRoot, targetAbsolutePath);
  }

  return null;
}
