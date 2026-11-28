import { JSON_SCHEMA, load } from 'js-yaml';
import { SETUP_PUBLISHER_PURPOSE, SETUP_PUBLISHER_WORKFLOW_PATH, type SetupPublisherOperation, type SetupPublisherPlan, type SetupPublisherProposal } from '../../domain/setup_publisher_installation';
import { setupBatchBranch } from './setup_batch_policy';
import { parseSetupPublisherInventoryLocator } from './setup_publisher_inventory_review_policy';

const sha = /^[a-f0-9]{40}$/u, digest = /^[a-f0-9]{64}$/u;
const coordinate = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const fields = ['schemaVersion', 'kind', 'destination', 'path', 'baseline', 'source', 'proposedWorkflowSha256', 'sourceChange',
  'consumerTemplatesChanged', 'productionVerification', 'installationAuthorized', 'installedDestinationSha', 'nativeCanary', 'dependency', 'coordination'];

export function setupPublisherOperationMatchesPlan(operation: SetupPublisherOperation, plan: SetupPublisherPlan): boolean {
  return operation.operationId === plan.operationId && operation.purpose === plan.purpose && operation.repositoryId === plan.target.id
    && operation.repository === `${plan.target.owner}/${plan.target.name}` && operation.defaultBranch === plan.target.defaultBranch
    && operation.baseSha === plan.target.baseSha && operation.sourceCommit === plan.sourceCommit && operation.planDigest === plan.digest
    && operation.approvalDigest === plan.approvalDigest && operation.actorId === plan.actorId;
}

export function parseSetupPublisherProposal(value: unknown): SetupPublisherProposal {
  const version2 = value !== null && typeof value === 'object' && !Array.isArray(value)
    && (value as Record<string, unknown>).schemaVersion === 2;
  if (!exact(value, version2 ? [...fields, 'inventoryReview'] : fields) || value.schemaVersion !== 1 && value.schemaVersion !== 2
    || value.kind !== 'review-only-publisher-installation-proposal'
    || value.path !== SETUP_PUBLISHER_WORKFLOW_PATH || !description(value.baseline) || !description(value.sourceChange)
    || !matches(value.proposedWorkflowSha256, digest) || value.consumerTemplatesChanged !== false
    || value.productionVerification !== 'disabled' || value.installationAuthorized !== false || value.installedDestinationSha !== null
    || value.dependency !== 976 || value.coordination !== 814) throw invalid();
  const destination = value.destination, source = value.source, native = value.nativeCanary;
  if (!exact(destination, ['repository', 'repositoryId', 'defaultBranch', 'head'])
    || !matches(destination.repository, coordinate) || !positive(destination.repositoryId)
    || !branch(destination.defaultBranch) || !matches(destination.head, sha)) throw invalid();
  if (!exact(source, ['repository', 'commit', 'pullRequest', 'merged', 'maintainerApproval', 'workflowSha256', 'actionManifestSha256', 'actionBundleSha256'])
    || source.repository !== 'vypdev/copilot' || !matches(source.commit, sha) || !positive(source.pullRequest)
    || typeof source.merged !== 'boolean' || !description(source.maintainerApproval)
    || !matches(source.workflowSha256, digest) || !matches(source.actionManifestSha256, digest) || !matches(source.actionBundleSha256, digest)) throw invalid();
  if (!exact(native, ['status', 'explicitlyAuthorizedPullRequest', 'runId']) || native.status !== 'not-run'
    || native.explicitlyAuthorizedPullRequest !== null || native.runId !== null) throw invalid();
  if (version2) {
    try { parseSetupPublisherInventoryLocator(value.inventoryReview); }
    catch { throw invalid(); }
  }
  return JSON.parse(JSON.stringify(value)) as SetupPublisherProposal;
}

/** The independently reviewed source bytes are transformed at exactly one fixed invocation. */
export function setupPublisherWorkflow(source: string, sourceCommit: string): string {
  if (!sha.test(sourceCommit)) throw invalid();
  const invocations = workflowInvocations(source);
  if (invocations.filter(value => value === './').length !== 1) throw invalid();
  const root = /^([ \t]+uses: )\.\/(\r?)$/gmu;
  if ([...source.matchAll(root)].length !== 1) throw invalid();
  const pinned = `vypdev/copilot@${sourceCommit}`;
  const transformed = source.replace(root, `$1${pinned}$2`);
  // The lexical match must be the executed scalar, never text inside a run block.
  if (JSON.stringify(workflowInvocations(transformed)) !== JSON.stringify(invocations.map(value => value === './' ? pinned : value))) throw invalid();
  return transformed;
}

/** Every executable source entrypoint is bound to the one independently hashed bundle. */
export function assertSetupPublisherActionManifest(source: string): void {
  if (Buffer.byteLength(source, 'utf8') > 100_000 || source.includes('\0')) throw invalid();
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  let document: unknown;
  try { document = load(source, { schema: JSON_SCHEMA }); } catch { throw invalid(); }
  if (!object(document) || !object(document.runs)) throw invalid();
  const runs = document.runs, keys = new Set(['using', 'main', 'pre', 'post', 'pre-if', 'post-if']);
  if (runs.using !== 'node20' && runs.using !== 'node24' || Object.keys(runs).some(key => !keys.has(key))) throw invalid();
  const bundle = 'build/github_action/index.js';
  for (const role of ['main', 'pre', 'post']) {
    if (role === 'main' || Object.prototype.hasOwnProperty.call(runs, role)) {
      if (runs[role] !== bundle && runs[role] !== `./${bundle}`) throw invalid();
    }
  }
}

/** Stateless parsing only: preserve original bytes and inspect every executable uses value. */
function workflowInvocations(source: string): string[] {
  if (Buffer.byteLength(source, 'utf8') > 100_000 || source.includes('\0')) throw invalid();
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value: Record<string, unknown>, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
  let document: unknown;
  try { document = load(source, { schema: JSON_SCHEMA }); } catch { throw invalid(); }
  if (!object(document) || !object(document.jobs) || !Object.keys(document.jobs).length) throw invalid();
  let nodes = 0;
  const ancestors = new Set<object>();
  const visit = (value: unknown, depth: number): void => {
    if (++nodes > 10_000 || depth > 64) throw invalid();
    if (value === null || typeof value !== 'object') return;
    if (ancestors.has(value)) throw invalid();
    ancestors.add(value);
    if (Array.isArray(value)) value.forEach(child => visit(child, depth + 1));
    else {
      if (own(value as Record<string, unknown>, '<<')) throw invalid();
      Object.values(value).forEach(child => visit(child, depth + 1));
    }
    ancestors.delete(value);
  };
  visit(document, 0);
  const invocations: string[] = [];
  const invocation = (scope: Record<string, unknown>, step: boolean): void => {
    if (!own(scope, 'uses')) return;
    const value = scope.uses;
    if (typeof value !== 'string' || !value || /\s/u.test(value) || value.includes('${{')
      || /^[./\\]/u.test(value) && (!step || value !== './') || step && own(scope, 'run')) throw invalid();
    invocations.push(value);
  };
  for (const job of Object.values(document.jobs)) {
    if (!object(job) || own(job, 'steps') === own(job, 'uses')) throw invalid();
    invocation(job, false);
    if (own(job, 'steps')) {
      if (!Array.isArray(job.steps) || job.steps.some(step => !object(step))) throw invalid();
      job.steps.forEach(step => invocation(step as Record<string, unknown>, true));
    }
  }
  return invocations;
}

/** Commander adaptation supplies explicit option names, including explicit false/empty values. */
export function assertSetupPublisherOptions(explicit: readonly string[]): void {
  const allowed = new Set(['publisherManifest', 'token', 'debug', 'dryRun', 'resumeOperation']);
  if (!explicit.includes('publisherManifest') || explicit.some(key => !allowed.has(key))) {
    throw new Error('The publisher proposal supports only --token, --debug, --dry-run and --resume-operation.');
  }
}

export function parseSetupPublisherOperation(value: unknown): SetupPublisherOperation {
  const required = ['schemaVersion', 'purpose', 'operationId', 'repositoryId', 'repository', 'defaultBranch', 'baseSha',
    'sourceCommit', 'planDigest', 'approvalDigest', 'actorId', 'status', 'effects'];
  const optional = ['preparedTree', 'preparedCommit', 'pullRequestNumber', 'uncertain'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  if (!exact(record, [...required, ...optional.filter(key => Object.prototype.hasOwnProperty.call(record, key))])
    || record.schemaVersion !== 2 || record.purpose !== SETUP_PUBLISHER_PURPOSE || typeof record.operationId !== 'string'
    || !positive(record.repositoryId) || !matches(record.repository, coordinate) || !branch(record.defaultBranch)
    || !matches(record.baseSha, sha) || !matches(record.sourceCommit, sha) || !matches(record.planDigest, digest)
    || !matches(record.approvalDigest, digest) || !positive(record.actorId)
    || !['ready', 'applying', 'blocked', 'partial', 'waiting-for-merge', 'verification-pending', 'unchanged', 'cancelled'].includes(String(record.status))
    || !Array.isArray(record.effects)) throw invalid();
  setupBatchBranch(record.operationId);
  const effects = ['tree', 'commit', 'branch', 'pull-request'];
  if (record.effects.length > effects.length || record.effects.some((effect, index) => effect !== effects[index])
    || record.preparedTree !== undefined && !matches(record.preparedTree, sha)
    || record.preparedCommit !== undefined && !matches(record.preparedCommit, sha)
    || record.pullRequestNumber !== undefined && !positive(record.pullRequestNumber)
    || record.effects.includes('tree') !== (record.preparedTree !== undefined)
    || record.effects.includes('commit') !== (record.preparedCommit !== undefined)
    || record.effects.includes('pull-request') !== (record.pullRequestNumber !== undefined)
    || record.uncertain !== undefined && (record.uncertain !== effects[record.effects.length]
      || !['applying', 'partial'].includes(String(record.status)))
    || record.status === 'waiting-for-merge' && record.effects.length !== effects.length) throw invalid();
  return JSON.parse(JSON.stringify(record)) as SetupPublisherOperation;
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function matches(value: unknown, pattern: RegExp): value is string { return typeof value === 'string' && pattern.test(value); }
function description(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 512 && !/[\p{Cc}\p{Cf}]/u.test(value); }
function branch(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && value !== '@' && !value.includes(']')
    && !/^[/-]|[/.]$|\.\.|@\{|[\p{Cc}\p{Cf}\s~^:?*[\\]/u.test(value)
    && !value.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'));
}
function invalid(): Error { return new Error('The publisher proposal is invalid or unsupported. No installation was started.'); }
