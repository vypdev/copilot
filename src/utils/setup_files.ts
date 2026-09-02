import * as fs from 'fs';
import * as path from 'path';
import { copySetupDirectory, copySetupFile } from './setup_file_copy';
import { logInfo } from './logger';
import type { SetupFeatures, SetupWorkflowComparison } from '../domain/setup';

/**
 * Ensure .github, .github/workflows and .github/ISSUE_TEMPLATE exist; create them if missing.
 * @param cwd - Directory (repo root)
 */
export function ensureGitHubDirs(cwd: string): void {
  const githubDir = path.join(cwd, '.github');
  const workflowsDir = path.join(cwd, '.github', 'workflows');
  const issueTemplateDir = path.join(cwd, '.github', 'ISSUE_TEMPLATE');
  if (!fs.existsSync(githubDir)) {
    logInfo('📁 Creating .github/...');
    fs.mkdirSync(githubDir, { recursive: true });
  }
  if (!fs.existsSync(workflowsDir)) {
    logInfo('📁 Creating .github/workflows/...');
    fs.mkdirSync(workflowsDir, { recursive: true });
  }
  if (!fs.existsSync(issueTemplateDir)) {
    logInfo('📁 Creating .github/ISSUE_TEMPLATE/...');
    fs.mkdirSync(issueTemplateDir, { recursive: true });
  }
}

/**
 * Copy setup files from setup/ to repo (.github/ workflows, ISSUE_TEMPLATE, and pull_request_template.md).
 * Skips files that already exist at destination (no overwrite).
 * Logs each file copied or skipped. No-op if setup/ does not exist.
 * By default setup dir is the copilot package root (not cwd), so it works when running from another repo.
 * @param cwd - Repo root (destination)
 * @param setupDirOverride - Optional path to setup/ folder (for tests). If not set, uses package root.
 * @returns { copied, skipped }
 */
export function copySetupFiles(
  cwd: string,
  setupDirOverride?: string,
  features?: SetupFeatures,
  options: { updateExistingWorkflows?: boolean; approvedWorkflowFiles?: readonly string[] } = {},
): { copied: number; skipped: number } {
  const setupDir = setupDirOverride ?? path.join(__dirname, '..', '..', 'setup');
  if (!fs.existsSync(setupDir)) return { copied: 0, skipped: 0 };

  const workflowFeatures: Readonly<Record<string, string>> = {
    'copilot_issue.yml': 'issues',
    'copilot_pull_request.yml': 'pullRequests',
    'copilot_commit.yml': 'commits',
    'copilot_issue_comment.yml': 'issueComments',
    'copilot_pull_request_comment.yml': 'pullRequestComments',
    'release_workflow.yml': 'release',
    'hotfix_workflow.yml': 'hotfix',
    'agent-cli-provisioning.yml': 'agentProvisioning',
    'copilot_credential_health.yml': 'credentialHealth',
  };
  const approvedWorkflowFiles = new Set(options.approvedWorkflowFiles ?? []);
  const backupDirectory = options.updateExistingWorkflows ? path.join(cwd, '.copilot', 'setup-backups', new Date().toISOString().replace(/[:.]/g, '-')) : undefined;
  const workflows = copySetupDirectory(
    path.join(setupDir, 'workflows'),
    path.join(cwd, '.github', 'workflows'),
    (fileName) => (fileName.endsWith('.yml') || fileName.endsWith('.yaml'))
      && (features === undefined || features[workflowFeatures[fileName]] !== false)
      && (!options.updateExistingWorkflows
        || approvedWorkflowFiles.has(fileName)
        || !fs.existsSync(path.join(cwd, '.github', 'workflows', fileName))),
    'setup/workflows',
    {
      overwrite: options.updateExistingWorkflows,
      backupDirectory,
    },
  );
  const issueTemplates = copySetupDirectory(
    path.join(setupDir, 'ISSUE_TEMPLATE'),
    path.join(cwd, '.github', 'ISSUE_TEMPLATE'),
    (fileName) => features?.issueTemplates !== false
      && (features?.release !== false || fileName !== 'release.yml')
      && (features?.hotfix !== false || fileName !== 'hotfix.yml'),
    'setup/ISSUE_TEMPLATE',
  );
  const pullRequestTemplate = features?.pullRequestTemplate === false
    ? { copied: 0, skipped: 0 }
    : copySetupFile(
      path.join(setupDir, 'pull_request_template.md'),
      path.join(cwd, '.github', 'pull_request_template.md'),
      'setup/pull_request_template.md',
      '.github/pull_request_template.md',
    );
  return [workflows, issueTemplates, pullRequestTemplate].reduce((total, current) => ({
    copied: total.copied + current.copied,
    skipped: total.skipped + current.skipped,
  }), { copied: 0, skipped: 0 });
}

export function compareSetupWorkflows(
  cwd: string,
  features?: SetupFeatures,
  setupDirOverride?: string,
): SetupWorkflowComparison[] {
  const setupDir = setupDirOverride ?? path.join(__dirname, '..', '..', 'setup');
  const workflowFeatures: Readonly<Record<string, string>> = {
    'copilot_issue.yml': 'issues',
    'copilot_pull_request.yml': 'pullRequests',
    'copilot_commit.yml': 'commits',
    'copilot_issue_comment.yml': 'issueComments',
    'copilot_pull_request_comment.yml': 'pullRequestComments',
    'release_workflow.yml': 'release',
    'hotfix_workflow.yml': 'hotfix',
    'agent-cli-provisioning.yml': 'agentProvisioning',
    'copilot_credential_health.yml': 'credentialHealth',
  };
  const sourceDirectory = path.join(setupDir, 'workflows');
  if (!fs.existsSync(sourceDirectory)) return [];
  return fs.readdirSync(sourceDirectory)
    .filter(file => (file.endsWith('.yml') || file.endsWith('.yaml')) && (features === undefined || features[workflowFeatures[file]] !== false))
    .filter(file => fs.statSync(path.join(sourceDirectory, file)).isFile())
    .map(file => {
      const source = path.join(sourceDirectory, file);
      const destination = path.join(cwd, '.github', 'workflows', file);
      if (!fs.existsSync(destination)) return { file, destination: `.github/workflows/${file}`, status: 'missing' as const };
      const equal = fs.readFileSync(source, 'utf8') === fs.readFileSync(destination, 'utf8');
      return { file, destination: `.github/workflows/${file}`, status: equal ? 'unchanged' as const : 'changed' as const };
    });
}

const ENV_TOKEN_KEY = 'PERSONAL_ACCESS_TOKEN';
const ENV_PLACEHOLDER_VALUE = 'github_pat_11..';
/** Minimum length for a token to be considered "defined" (not placeholder). */
const MIN_VALID_TOKEN_LENGTH = 20;

function isTokenValueValid(token: string): boolean {
  const t = token.trim();
  return t.length >= MIN_VALID_TOKEN_LENGTH && t !== ENV_PLACEHOLDER_VALUE;
}

/**
 * Resolves the PERSONAL_ACCESS_TOKEN for setup from a single priority order:
 * 1. override (e.g. CLI --token) if provided and valid,
 * 2. process.env.PERSONAL_ACCESS_TOKEN.
 * Returns undefined if no valid token is found.
 */
export function getSetupToken(_cwd: string, override?: string): string | undefined {
  const overrideTrimmed = override?.trim();
  if (overrideTrimmed && isTokenValueValid(overrideTrimmed)) return overrideTrimmed;
  const fromEnv = process.env[ENV_TOKEN_KEY]?.trim();
  if (fromEnv && isTokenValueValid(fromEnv)) return fromEnv;
  return undefined;
}

/**
 * Returns true if a valid setup token is available (same resolution order as getSetupToken).
 * Pass an optional override (e.g. CLI --token) so validation considers all sources consistently.
 */
export function hasValidSetupToken(cwd: string, override?: string): boolean {
  return getSetupToken(cwd, override) !== undefined;
}
