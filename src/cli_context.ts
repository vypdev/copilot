import { execSync } from 'child_process';
import { ERRORS } from './cli/cli_errors';

export type GitInfo = { owner: string; repo: string } | { error: string };

export function cleanCliArg(value: unknown): string {
  if (value == null) return '';
  const stringValue = String(value);
  return stringValue.startsWith('=') ? stringValue.substring(1) : stringValue;
}

export function getGitInfo(): GitInfo {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url').toString().trim();
    const match = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+)(?:\.git)?$/);
    if (!match) return { error: ERRORS.GIT_REPOSITORY_NOT_FOUND };
    return { owner: match[1], repo: match[2].replace('.git', '') };
  } catch {
    return { error: ERRORS.GIT_REPOSITORY_NOT_FOUND };
  }
}

export function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim() || 'main';
  } catch {
    return 'main';
  }
}

export function isInsideGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
