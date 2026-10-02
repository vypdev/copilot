import { execFileSync, execSync } from 'child_process';
import { realpathSync } from 'node:fs';
import { ERRORS } from './cli/cli_errors';
import { canonicalGitObjectId } from './domain/git_object_id';

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

/** A verified branch name for web setup; detached HEAD and failed git reads are not guessed. */
export function getCurrentAttachedBranch(cwd: string): string | undefined {
  try {
    const branch = execSync('git symbolic-ref --quiet --short HEAD', { cwd }).toString().trim();
    return branch && branch !== 'HEAD' ? branch : undefined;
  } catch {
    return undefined;
  }
}

/** Positive local evidence only; a missing ref says nothing about remote branches. */
export function hasLocalOrTrackedGitBranch(cwd: string, branch: string): boolean {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/u.test(branch) || branch.includes('..') || branch.endsWith('.lock')) return false;
  for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
    try {
      execFileSync('git', ['show-ref', '--verify', '--quiet', ref], { cwd, stdio: 'pipe' });
      return true;
    } catch { /* Try the other explicit ref. */ }
  }
  return false;
}

/** Returns the canonical object ID for the workspace revision being analyzed. */
export function getCurrentHeadSha(): string | undefined {
  try {
    return canonicalGitObjectId(execSync('git rev-parse HEAD').toString().trim());
  } catch {
    return undefined;
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

/** Canonical checkout root for plans whose file paths are repository-relative. */
export function getGitRepositoryRoot(cwd: string): string {
  const root = execSync('git rev-parse --show-toplevel', { cwd, stdio: 'pipe' }).toString().trim();
  return realpathSync(root);
}

export function isGitRepositoryRoot(cwd: string): boolean {
  try {
    return execSync('git rev-parse --show-prefix', { cwd, stdio: 'pipe' }).toString().trim() === '';
  } catch {
    return false;
  }
}
