import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll } from 'js-yaml';
import { createHash } from 'node:crypto';
import type { SetupConfiguration } from '../domain/setup';
import type { SetupInstallationReview } from '../domain/setup_runner';
import { isSetupWorkflowEnabled } from '../domain/setup_workflow_catalog';
import { effectiveIssueWorkflowFeatures } from '../application/policies/setup_issue_workflow_policy';
import { setupRunnerRole, validateSetupRunners } from '../application/policies/setup_runner_policy';
import { hasRootLocalSetupAction, renderSetupWorkflowUpgrade, isSourceSetupPushWorkflow } from './setup_workflow_upgrade';
import { renderApprovalObserverWorkflow } from '../domain/setup_approval_workflow';
import { redactSensitiveText } from '../domain/security/sensitive_text';
import { REPOSITORY_AGENT_GUIDE_PATH, REPOSITORY_AGENT_PROFILE_PATH, REPOSITORY_AGENT_MANIFEST_PATH,
  REPOSITORY_AGENT_SKILL_PATH } from '../application/policies/repository_agent_guidance_policy';
import { SETUP_VERIFICATION_ACTION_PATH, type SetupVerificationActionReview } from '../domain/setup_verification_action';
import { inspectSetupVerificationActionPath, readSetupVerificationActionStarter } from '../infrastructure/setup_verification_action';
import { copilotCommentRunner } from '../domain/copilot_comment_workflow';

export const SETUP_RUNNER_SNAPSHOT = '.copilot/runner-profile.json';
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : undefined;
const read = (path: string): string | undefined => existsSync(path) ? readFileSync(path, 'utf8') : undefined;
export function renderSetupRunnerSnapshot(configuration: SetupConfiguration): string | undefined {
  if (!configuration.runners || configuration.runners.mode === 'retain') return undefined;
  const errors = validateSetupRunners(configuration.runners);
  if (errors.length) throw new Error(errors.join(' '));
  const { source, discover: _discover, ...runners } = configuration.runners;
  return `${JSON.stringify({ schemaVersion: 1, runners, ...(source ? { source: { scope: source.scope,
    registryDigest: createHash('sha256').update(source.value).digest('hex') } } : {}) }, null, 2)}\n`;
}

export function compatibleSetupRunnerSnapshot(content: string): boolean {
  try {
    const value = object(JSON.parse(content));
    if (!value || Object.keys(value).some(key => !['schemaVersion', 'runners', 'source'].includes(key)) || value.schemaVersion !== 1) return false;
    const runners = object(value.runners);
    if (!runners || ['source', 'discover'].some(key => Object.prototype.hasOwnProperty.call(runners, key))) return false;
    if (runners.mode !== 'organization-profile') return value.source === undefined && validateSetupRunners(runners).length === 0;
    const source = object(value.source);
    if (!source || Object.keys(source).length !== 2 || !['repository', 'organization'].includes(String(source.scope))
      || typeof source.registryDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(source.registryDigest)) return false;
    return validateSetupRunners({ ...runners, source: { scope: source.scope, value: JSON.stringify({ schemaVersion: 1,
      profiles: [{ id: runners.profileId, group: runners.group, labels: runners.labels, validation: runners.validation }] }) } }).length === 0;
  } catch { return false; }
}

/** Read-only parity and before/after review uses the exact same renderer as Apply. */
export function inspectSetupInstallation(root: string, configuration: SetupConfiguration,
  setup = join(__dirname, '..', '..', 'setup')): SetupInstallationReview {
  const assets: SetupInstallationReview['assets'][number][] = [];
  const jobs: SetupInstallationReview['jobs'][number][] = [];
  const changes: SetupInstallationReview['changes'][number][] = [];
  const blockers: string[] = [];
  let action: SetupVerificationActionReview['action'];
  try { action = inspectSetupVerificationActionPath(root); }
  catch (error) {
    action = 'blocked';
    blockers.push(error instanceof Error ? error.message : 'Verification setup path could not be inspected.');
  }
  const verificationSetup = { action, enabled: configuration.repository.verificationSetup ?? false,
    mainBranch: configuration.repository.mainBranch };
  assets.push({ path: SETUP_VERIFICATION_ACTION_PATH, enabled: verificationSetup.enabled,
    status: action === 'create' ? 'missing' : action === 'preserve' ? 'customized' : 'incompatible' });
  if (action === 'blocked') return { assets, jobs, changes, blockers, verificationSetup };
  if (action === 'create') changes.push({ path: SETUP_VERIFICATION_ACTION_PATH, before: null, after: readSetupVerificationActionStarter() });
  const addJobs = (file: string, content: string, retained: boolean) => {
    const documents = loadAll(content);
    if (documents.length !== 1) throw new Error('Workflow review needs exactly one YAML document.');
    const parsedJobs = object(object(documents[0])?.jobs);
    if (!parsedJobs) throw new Error('Workflow jobs are unavailable for review.');
    for (const [job, raw] of Object.entries(parsedJobs)) {
      const runsOn = copilotCommentRunner(object(raw));
      if (runsOn === undefined) continue; // reusable workflow calls have no runner
      jobs.push({ file, job, role: setupRunnerRole(file, job) ?? 'validation',
        runsOn: runsOn as SetupInstallationReview['jobs'][number]['runsOn'], status: 'access-unknown', retained });
      if (jobs.length > 200) throw new Error('Workflow review exceeds its fixed 200-job budget.');
    }
  };
  const directory = join(root, '.github', 'workflows');
  const sourceFiles = existsSync(join(setup, 'workflows')) ? readdirSync(join(setup, 'workflows')).filter(file => file.endsWith('.yml') || file.endsWith('.yaml')) : [];
  const installedFiles = existsSync(directory) ? readdirSync(directory).filter(file => file.endsWith('.yml') || file.endsWith('.yaml')) : [];
  if (installedFiles.length > 100) throw new Error('Workflow review exceeds its fixed 100-file budget.');
  const existing = new Map(installedFiles.map(file => {
    const content = readFileSync(join(directory, file), 'utf8');
    if (Buffer.byteLength(content) > 100_000) throw new Error('Workflow review exceeds its per-file budget.');
    return [file, content];
  }));
  if ([...existing.values()].reduce((sum, value) => sum + Buffer.byteLength(value), 0) > 2_000_000) throw new Error('Workflow review exceeds its byte budget.');
  const source = [...existing.values()].some(hasRootLocalSetupAction);
  const features = effectiveIssueWorkflowFeatures(configuration);
  for (const file of sourceFiles) {
    const path = `.github/workflows/${file}`; const before = existing.get(file);
    const enabled = isSetupWorkflowEnabled(file, features) && (file !== 'copilot_pull_request_approval.yml' || configuration.pullRequestApproval.mode !== 'off');
    const template = readFileSync(join(setup, 'workflows', file), 'utf8');
    const preserved = source && before !== undefined;
    const after = !enabled ? before : preserved && !isSourceSetupPushWorkflow(file) ? before
      : file === 'copilot_pull_request_approval.yml' ? renderApprovalObserverWorkflow(template, configuration.pullRequestApproval)
        : renderSetupWorkflowUpgrade(template, before, { file, runners: configuration.runners, source });
    assets.push({ path, enabled, status: before === undefined ? 'missing' : preserved ? 'source-only'
      : before === after && (before === template || (configuration.runners?.mode ?? 'retain') !== 'retain') ? 'shared' : 'customized' });
    if (enabled && after !== undefined) {
      addJobs(file, after, preserved || configuration.runners?.mode === 'retain' || !configuration.runners);
      // Enabled workflows render or retain a complete string; disabled assets never produce removals.
      if (before !== after) changes.push({ path, before: before === undefined ? null : redactSensitiveText(before), after: redactSensitiveText(after) });
    }
  }
  for (const file of installedFiles.filter(file => !sourceFiles.includes(file))) {
    assets.push({ path: `.github/workflows/${file}`, enabled: true, status: source ? 'source-only' : 'customized' });
    addJobs(file, existing.get(file)!, true);
  }
  for (const file of existsSync(join(setup, 'ISSUE_TEMPLATE')) ? readdirSync(join(setup, 'ISSUE_TEMPLATE')) : []) {
    const path = `.github/ISSUE_TEMPLATE/${file}`; const before = read(join(root, path));
    assets.push({ path, enabled: features.issueTemplates !== false && features.issues !== false,
      status: before === undefined ? 'missing' : before === read(join(setup, 'ISSUE_TEMPLATE', file)) ? 'shared' : 'customized' });
  }
  const guidance = [REPOSITORY_AGENT_GUIDE_PATH, REPOSITORY_AGENT_PROFILE_PATH, REPOSITORY_AGENT_MANIFEST_PATH, REPOSITORY_AGENT_SKILL_PATH];
  for (const path of guidance) {
    // Markdown guidance is collaborator input, never runtime instructions.
    // Parity needs its presence only; decode controlled JSON metadata separately.
    const present = existsSync(join(root, path));
    let compatible = true;
    if (present && path.endsWith('.json')) {
      try {
        const data = object(JSON.parse(readFileSync(join(root, path), 'utf8'))); const generator = object(data?.generator);
        // Profile and ownership-manifest generator contracts are distinct.
        const contract = path === REPOSITORY_AGENT_PROFILE_PATH ? 2 : 1;
        compatible = data?.schemaVersion === 2 && generator?.name === '@vypdev/copilot'
          && Object.keys(generator).length === 2 && generator.contractVersion === contract;
      } catch { compatible = false; }
    }
    assets.push({ path, enabled: configuration.repositoryAgentGuidance.enabled,
      status: !present ? 'missing' : !compatible ? 'incompatible' : source ? 'source-only' : 'shared' });
    if (!compatible && configuration.repositoryAgentGuidance.enabled && !source) blockers.push(`${path}: unsupported generator metadata. Retain the asset or restore a compatible generator before regeneration.`);
  }
  const presentGuidance = guidance.filter(path => existsSync(join(root, path))).length;
  if (source && presentGuidance > 0 && presentGuidance !== guidance.length) blockers.push('Source guidance is incomplete. Restore it with the checked-in source generator before setup.');
  const before = read(join(root, SETUP_RUNNER_SNAPSHOT)); const after = renderSetupRunnerSnapshot(configuration);
  assets.push({ path: SETUP_RUNNER_SNAPSHOT, enabled: after !== undefined || before !== undefined,
    status: before === undefined ? 'missing' : !compatibleSetupRunnerSnapshot(before) ? 'incompatible' : before === after || after === undefined ? 'shared' : 'customized' });
  if (after !== undefined && before !== after) changes.push({ path: SETUP_RUNNER_SNAPSHOT,
    before: before === undefined ? null : redactSensitiveText(before), after: redactSensitiveText(after) });
  if (after !== undefined && before !== undefined && !compatibleSetupRunnerSnapshot(before)) blockers.push('Runner snapshot is incompatible. Retain it or restore a supported version before replacing routing.');
  return { assets, jobs, changes, blockers, verificationSetup };
}
