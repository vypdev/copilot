import * as fs from 'fs';
import * as path from 'path';
import { copySetupDirectory, copySetupFile } from './setup_file_copy';
import { logInfo } from './logger';
import type { SetupFeatures, SetupWorkflowComparison } from '../domain/setup';
import { enabledSetupWorkflowFiles, isSetupWorkflowEnabled } from '../domain/setup_workflow_catalog';
import type { SetupConfiguration } from '../domain/setup';
import { ISSUE_WORKFLOW_CATALOG, ISSUE_WORKFLOW_KINDS, issueWorkflowFormFiles } from '../domain/issue_workflow_profile';
import {
  effectiveIssueFormLabels,
  effectiveIssueWorkflowFeatures,
  effectiveIssueWorkflowProfile,
} from '../application/policies/setup_issue_workflow_policy';
import { reconcileRepositoryAgentGuidance } from './repository_agent_guidance';
import { renderApprovalObserverWorkflow } from '../domain/setup_approval_workflow';

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
  options: {
    updateExistingWorkflows?: boolean;
    approvedWorkflowFiles?: readonly string[];
    setupConfiguration?: Readonly<SetupConfiguration>;
  } = {},
): { copied: number; skipped: number } {
  const setupDir = setupDirOverride ?? path.join(__dirname, '..', '..', 'setup');
  if (!fs.existsSync(setupDir)) return { copied: 0, skipped: 0 };

  const approvedWorkflowFiles = new Set(options.approvedWorkflowFiles ?? []);
  const effectiveFeatures = options.setupConfiguration
    ? effectiveIssueWorkflowFeatures(options.setupConfiguration)
    : features;
  const selectedIssueTemplateFiles = options.setupConfiguration
    ? new Set(['config.yml', ...issueWorkflowFormFiles(effectiveIssueWorkflowProfile(options.setupConfiguration))])
    : undefined;
  const backupDirectory = options.updateExistingWorkflows ? path.join(cwd, '.copilot', 'setup-backups', new Date().toISOString().replace(/[:.]/g, '-')) : undefined;
  const retired = options.setupConfiguration
    ? retireDeselectedSetupAssets(cwd, setupDir, options.setupConfiguration)
    : { copied: 0, skipped: 0 };
  const workflows = copySetupDirectory(
    path.join(setupDir, 'workflows'),
    path.join(cwd, '.github', 'workflows'),
    (fileName) => (fileName.endsWith('.yml') || fileName.endsWith('.yaml'))
      && fileName !== 'copilot_pull_request_approval.yml'
      && isSetupWorkflowEnabled(fileName, effectiveFeatures)
      && (!options.updateExistingWorkflows
        || approvedWorkflowFiles.has(fileName)
        || !fs.existsSync(path.join(cwd, '.github', 'workflows', fileName))),
    'setup/workflows',
    {
      overwrite: options.updateExistingWorkflows,
      backupDirectory,
    },
  );
  const approvalWorkflow = options.setupConfiguration?.pullRequestApproval.mode !== 'off' && options.setupConfiguration
    ? copyApprovalObserverWorkflow(cwd, setupDir, options.setupConfiguration, options.updateExistingWorkflows === true, approvedWorkflowFiles, backupDirectory)
    : { copied: 0, skipped: 0 };
  const issueTemplates = options.setupConfiguration
    ? copySelectedIssueForms(cwd, setupDir, options.setupConfiguration)
    : copySetupDirectory(
      path.join(setupDir, 'ISSUE_TEMPLATE'),
      path.join(cwd, '.github', 'ISSUE_TEMPLATE'),
      (fileName) => features?.issueTemplates !== false
        && features?.issues !== false
        && (!selectedIssueTemplateFiles || selectedIssueTemplateFiles.has(fileName))
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
  const guidance = options.setupConfiguration
    ? reconcileRepositoryAgentGuidance(cwd, options.setupConfiguration)
    : { copied: 0, skipped: 0 };
  return [retired, workflows, approvalWorkflow, issueTemplates, pullRequestTemplate, guidance].reduce((total, current) => ({
    copied: total.copied + current.copied,
    skipped: total.skipped + current.skipped,
  }), { copied: 0, skipped: 0 });
}

function copyApprovalObserverWorkflow(
  cwd: string,
  setupDir: string,
  configuration: Readonly<SetupConfiguration>,
  updateExisting: boolean,
  approved: ReadonlySet<string>,
  backupDirectory?: string,
): { copied: number; skipped: number } {
  const file = 'copilot_pull_request_approval.yml';
  const template = fs.readFileSync(path.join(setupDir, 'workflows', file), 'utf8');
  const content = renderApprovalObserverWorkflow(template, configuration.pullRequestApproval);
  const destination = path.join(cwd, '.github', 'workflows', file);
  if (isLocalSourceApprovalObserver(cwd, destination)) return { copied: 0, skipped: 1 };
  if (fs.existsSync(destination)) {
    if (fs.readFileSync(destination, 'utf8') === content) return { copied: 0, skipped: 1 };
    if (!updateExisting || !approved.has(file)) return { copied: 0, skipped: 1 };
    if (!backupDirectory) throw new Error('Changed approval observer needs a backup directory.');
    const backup = path.join(backupDirectory, '.github', 'workflows', file);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(destination, backup);
  }
  atomicWriteSetupAsset(destination, content);
  return { copied: 1, skipped: 0 };
}

function copySelectedIssueForms(
  cwd: string,
  setupDir: string,
  configuration: Readonly<SetupConfiguration>,
): { copied: number; skipped: number } {
  if (configuration.features.issueTemplates === false || configuration.features.issues === false) {
    return { copied: 0, skipped: 0 };
  }
  const sourceDirectory = path.join(setupDir, 'ISSUE_TEMPLATE');
  const destinationDirectory = path.join(cwd, '.github', 'ISSUE_TEMPLATE');
  const profile = effectiveIssueWorkflowProfile(configuration);
  const formLabels = effectiveIssueFormLabels(configuration);
  let copied = 0;
  let skipped = 0;
  const copyContent = (fileName: string, content: string, rawSource = content) => {
    const destination = path.join(destinationDirectory, fileName);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (fs.existsSync(destination)) {
      const existing = fs.readFileSync(destination, 'utf8');
      if (existing === content) {
        skipped++;
        return;
      }
      if (normalizeIssueFormLabels(existing) !== normalizeIssueFormLabels(rawSource)) {
        skipped++;
        logInfo(`⚠️  Preserving customized Issue Form .github/ISSUE_TEMPLATE/${fileName}.`);
        return;
      }
      backupSetupAsset(cwd, `.github/ISSUE_TEMPLATE/${fileName}`, 'updated-form');
    }
    atomicWriteSetupAsset(destination, content);
    copied++;
  };
  const configSource = path.join(sourceDirectory, 'config.yml');
  copyContent('config.yml', fs.readFileSync(configSource, 'utf8'));
  for (const kind of ISSUE_WORKFLOW_KINDS.filter(candidate => profile.enabled.includes(candidate))) {
    const fileName = ISSUE_WORKFLOW_CATALOG[kind].formFile;
    const source = path.join(sourceDirectory, fileName);
    const raw = fs.readFileSync(source, 'utf8');
    const rendered = raw.replace(/^labels:\s*.*$/mu, `labels: ${JSON.stringify(formLabels[kind])}`);
    copyContent(fileName, rendered, raw);
  }
  return { copied, skipped };
}

function retireDeselectedSetupAssets(
  cwd: string,
  setupDir: string,
  configuration: Readonly<SetupConfiguration>,
): { copied: number; skipped: number } {
  const profile = effectiveIssueWorkflowProfile(configuration);
  const selectedForms = new Set(configuration.features.issues !== false && configuration.features.issueTemplates !== false
    ? ['config.yml', ...issueWorkflowFormFiles(profile)]
    : []);
  const selectedWorkflows = new Set(enabledSetupWorkflowFiles(effectiveIssueWorkflowFeatures(configuration)));
  const candidates = [
    ...['config.yml', ...ISSUE_WORKFLOW_KINDS.map(kind => ISSUE_WORKFLOW_CATALOG[kind].formFile)]
      .filter(file => !selectedForms.has(file))
      .map(file => ({ source: path.join(setupDir, 'ISSUE_TEMPLATE', file), relative: `.github/ISSUE_TEMPLATE/${file}`, form: true })),
    ...['release_workflow.yml', 'hotfix_workflow.yml', 'copilot_deployment_orchestration.yml']
      .filter(file => !selectedWorkflows.has(file))
      .map(file => ({ source: path.join(setupDir, 'workflows', file), relative: `.github/workflows/${file}`, form: false })),
  ];
  let retired = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const destination = path.join(cwd, candidate.relative);
    if (!fs.existsSync(destination) || !fs.existsSync(candidate.source)) continue;
    const current = fs.readFileSync(destination, 'utf8');
    const source = fs.readFileSync(candidate.source, 'utf8');
    const safelyOwned = candidate.form
      ? normalizeIssueFormLabels(current) === normalizeIssueFormLabels(source)
      : current === source;
    if (!safelyOwned) {
      skipped++;
      logInfo(`⚠️  Preserving customized deselected setup asset ${candidate.relative}.`);
      continue;
    }
    const backup = setupBackupDestination(cwd, candidate.relative, 'retired');
    fs.renameSync(destination, backup);
    retired++;
    logInfo(`📦 Retired deselected setup asset ${candidate.relative} to ${path.relative(cwd, backup)}.`);
  }
  return { copied: retired, skipped };
}

function normalizeIssueFormLabels(content: string): string {
  return content.replace(/^labels:\s*.*$/mu, 'labels: <setup-managed>');
}

function atomicWriteSetupAsset(destination: string, content: string): void {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.copilot-${process.pid}.tmp`;
  fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o644 });
  fs.renameSync(temporary, destination);
}

function backupSetupAsset(cwd: string, relativePath: string, operation: string): void {
  const source = path.join(cwd, relativePath);
  if (!fs.existsSync(source)) return;
  fs.copyFileSync(source, setupBackupDestination(cwd, relativePath, operation));
}

function setupBackupDestination(cwd: string, relativePath: string, operation: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const destination = path.join(cwd, '.copilot', 'setup-backups', `${stamp}-${operation}`, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  return destination;
}

export function compareSetupWorkflows(
  cwd: string,
  features?: SetupFeatures,
  setupDirOverride?: string,
  configuration?: Readonly<SetupConfiguration>,
): SetupWorkflowComparison[] {
  const setupDir = setupDirOverride ?? path.join(__dirname, '..', '..', 'setup');
  const sourceDirectory = path.join(setupDir, 'workflows');
  if (!fs.existsSync(sourceDirectory)) return [];
  return fs.readdirSync(sourceDirectory)
    .filter(file => (file.endsWith('.yml') || file.endsWith('.yaml')) && isSetupWorkflowEnabled(file, features)
      && (file !== 'copilot_pull_request_approval.yml' || (configuration && configuration.pullRequestApproval.mode !== 'off')))
    .filter(file => fs.statSync(path.join(sourceDirectory, file)).isFile())
    .map(file => {
      const source = path.join(sourceDirectory, file);
      const destination = path.join(cwd, '.github', 'workflows', file);
      if (!fs.existsSync(destination)) return { file, destination: `.github/workflows/${file}`, status: 'missing' as const };
      const expected = file === 'copilot_pull_request_approval.yml' && configuration
        ? renderApprovalObserverWorkflow(fs.readFileSync(source, 'utf8'), configuration.pullRequestApproval)
        : fs.readFileSync(source, 'utf8');
      const equal = isLocalSourceApprovalObserver(cwd, destination)
        || expected === fs.readFileSync(destination, 'utf8');
      return { file, destination: `.github/workflows/${file}`, status: equal ? 'unchanged' as const : 'changed' as const };
    });
}

/** This repository tests the unreleased Action from a reviewed default-branch workflow. */
function isLocalSourceApprovalObserver(cwd: string, destination: string): boolean {
  const packageRoot = path.resolve(__dirname, '..', '..');
  if (path.resolve(cwd) !== packageRoot || !fs.existsSync(destination)) return false;
  const sourceObserver = path.join(packageRoot, 'setup', 'source-workflows', 'copilot_pull_request_approval.yml');
  return fs.existsSync(sourceObserver)
    && fs.readFileSync(destination, 'utf8') === fs.readFileSync(sourceObserver, 'utf8');
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
