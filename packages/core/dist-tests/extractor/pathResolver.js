import path from 'path';
import fs from 'fs';
/**
 * Resolves an import literal to a canonical repository-relative path.
 *
 * @param importLiteral The string path from the import statement (e.g. '../services/user')
 * @param currentFilePath The absolute path of the current file
 * @param repoRoot The absolute path of the repository root
 * @returns The repository-relative path to the target file, or null if it cannot be resolved.
 */
export function resolveModulePath(importLiteral, currentFilePath, repoRoot) {
    if (!importLiteral.startsWith('.')) {
        // Currently only resolving relative imports. 
        // Alias resolution (e.g. '@/') requires parsing tsconfig.json paths, which is deferred.
        return null;
    }
    const currentDir = path.dirname(currentFilePath);
    const targetAbsolutePath = path.resolve(currentDir, importLiteral);
    // Try common extensions
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
