import { Command } from "commander";
import { resolve, basename, dirname, join, relative } from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { analyzeTarget, compareGraphs } from "@chomp/core";
import { getGitInfo } from "../utils/git.js";

export function registerDiffCommand(program: Command): void {
  program
    .command("diff <path>")
    .description("Compare the dirty working tree against the HEAD commit")
    .action((inputPath: string) => {
      const baseDir = process.env.INIT_CWD ?? process.cwd();
      const targetPath = resolve(baseDir, inputPath);

      if (!existsSync(targetPath)) {
        console.error(`Error: Path does not exist: ${targetPath}`);
        process.exit(1);
      }

      // 1. Get Git Info
      let repoPath = targetPath;
      try {
        repoPath = execSync('git rev-parse --show-toplevel', { cwd: targetPath, encoding: 'utf8' }).trim();
      } catch (e) {
        // Fallback if not inside a git repo directly
        repoPath = existsSync(join(targetPath, ".git")) ? targetPath : dirname(targetPath);
      }
      
      const { commitSha, branchName } = getGitInfo(repoPath);

      if (!commitSha) {
        console.error("Error: Not a git repository or no commits found.");
        process.exit(1);
      }

      console.log(`\n🔍 Comparing Dirty Working Tree vs HEAD (${commitSha.substring(0, 7)})...`);

      // 2. Extract HEAD using git archive into a temporary directory
      const tempId = `chomp-head-${commitSha.substring(0, 7)}-${Date.now()}`;
      const tempDir = join(tmpdir(), tempId);
      
      mkdirSync(tempDir, { recursive: true });

      try {
        console.log(`📦 Archiving HEAD to temporary directory...`);
        // We use git archive to safely get the exact committed state without touching worktrees
        execSync(`git archive HEAD | tar -x -C "${tempDir}"`, { cwd: repoPath, stdio: 'ignore' });
        
        // Find the relative path from the git root to the target path
        const relTarget = relative(repoPath, targetPath);
        const tempTarget = relTarget ? join(tempDir, relTarget) : tempDir;

        // 3. Run Analysis on HEAD
        console.log(`🧠 Analyzing HEAD state...`);
        const headGraph = analyzeTarget(tempTarget);

        // 4. Run Analysis on Dirty Tree
        console.log(`🧠 Analyzing Dirty Working Tree...`);
        const dirtyGraph = analyzeTarget(targetPath);

        // 5. Compute the Delta (Ghost Nodes)
        console.log(`⚙️ Computing Architectural Delta...`);
        const delta = compareGraphs(headGraph, dirtyGraph);

        // Calculate stats
        const addedNodes = delta.nodes.filter(n => n.diffStatus === 'ADDED').length;
        const removedNodes = delta.nodes.filter(n => n.diffStatus === 'REMOVED').length;
        const modifiedNodes = delta.nodes.filter(n => n.diffStatus === 'MODIFIED').length;
        const unchangedNodes = delta.nodes.filter(n => n.diffStatus === 'UNCHANGED').length;

        const addedEdges = delta.edges.filter(e => e.diffStatus === 'ADDED').length;
        const removedEdges = delta.edges.filter(e => e.diffStatus === 'REMOVED').length;
        const modifiedEdges = delta.edges.filter(e => e.diffStatus === 'MODIFIED').length;

        console.log(`\n✅ Diff Complete!`);
        console.log(`------------------------------------------------`);
        console.log(`[NODES] Added: ${addedNodes} | Removed: ${removedNodes} | Modified: ${modifiedNodes} | Unchanged: ${unchangedNodes}`);
        console.log(`[EDGES] Added: ${addedEdges} | Removed: ${removedEdges} | Modified: ${modifiedEdges}`);
        console.log(`------------------------------------------------\n`);
        
        console.log(`(In the future, this IntentDiff will power the UI Ghost Nodes!)\n`);

      } catch (e: any) {
        console.error("Diff failed:", e.message);
      } finally {
        // Cleanup temp directory
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });
}
