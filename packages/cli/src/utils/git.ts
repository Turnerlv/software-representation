import { execSync } from 'node:child_process';

export function getGitInfo(cwd: string): { commitSha?: string; branchName?: string } {
  try {
    const commitSha = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const branchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    
    return {
      commitSha: commitSha || undefined,
      branchName: branchName === 'HEAD' ? undefined : (branchName || undefined), // handle detached head
    };
  } catch (e) {
    // If not a git repository or git is not installed, return undefined silently
    return {};
  }
}
