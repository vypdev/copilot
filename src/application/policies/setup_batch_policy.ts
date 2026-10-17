import { SETUP_BATCH_MAX_TARGETS, type SetupBatchInstallationReceipt, type SetupBatchOperation,
  type SetupBatchPlan, type SetupBatchSharedResource, type SetupBatchTarget } from '../../domain/setup_batch';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const sha = /^[a-f0-9]{40}$/u;
const digest = /^[a-f0-9]{64}$/u;
const name = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
export function setupBatchBranch(operationId: string): string {
  if (!uuid.test(operationId)) throw new Error('Invalid setup operation identity.');
  return `setup/copilot/${operationId}`;
}
export function setupBatchMarker(operationId: string, repositoryId: number): string {
  setupBatchBranch(operationId);
  if (!positive(repositoryId)) throw new Error('Invalid repository identity.');
  return `<!-- copilot-setup-operation:v1:${operationId}:${repositoryId} -->`;
}
export function validateSetupBatchTargets(organization: string, targets: readonly SetupBatchTarget[]): readonly string[] {
  const errors: string[] = [];
  if (!name.test(organization)) errors.push('Invalid organization name.');
  if (targets.length < 1 || targets.length > SETUP_BATCH_MAX_TARGETS) errors.push('Select between 1 and 25 repositories.');
  const ids = new Set<number>(); const names = new Set<string>();
  const ownerId = targets[0]?.ownerId;
  for (const target of targets) {
    const key = `${target.owner}/${target.name}`.toLowerCase();
    if (!positive(target.id) || ids.has(target.id) || names.has(key)) errors.push('Repository selection contains invalid or duplicate identities.');
    ids.add(target.id); names.add(key);
    if (!positive(target.ownerId) || target.ownerId !== ownerId || target.owner.toLowerCase() !== organization.toLowerCase()) errors.push('All targets must belong to the same organization.');
    if (!name.test(target.name) || !sha.test(target.baseSha) || !validBranch(target.defaultBranch)) errors.push('Repository identity or default branch is invalid.');
    if (target.archived || target.disabled || !target.canPush) errors.push('A selected repository is archived, disabled or unavailable for setup.');
  }
  return errors;
}
export function setupSharedResourceApplies(resource: SetupBatchSharedResource, target: SetupBatchTarget): boolean {
  return resource.visibility === 'all' || resource.visibility === 'private' && target.private
    || resource.visibility === 'selected' && resource.selectedRepositoryIds.includes(target.id);
}
export function beginSetupBatchOperation(plan: SetupBatchPlan): SetupBatchOperation {
  setupBatchBranch(plan.operationId);
  const errors = validateSetupBatchTargets(plan.organization, plan.targets.map(item => item.target));
  if (errors.length) throw new Error(errors.join(' '));
  return { schemaVersion: 1, operationId: plan.operationId, organization: plan.organization,
    targets: plan.targets.map(item => {
      if (!digest.test(item.digest)) throw new Error('Invalid plan digest.');
      return { repositoryId: item.target.id, repository: item.target.name, defaultBranch: item.target.defaultBranch,
        baseSha: item.target.baseSha, planDigest: item.digest, status: item.blocked.length ? 'blocked' : 'ready', effects: [],
        ...(item.blocked.length ? { reason: 'preflight' as const } : {}) };
    }) };
}
export function assertSetupBatchOperationMatchesPlan(operation: SetupBatchOperation, plan: SetupBatchPlan): void {
  const initial = beginSetupBatchOperation(plan);
  if (operation.operationId !== initial.operationId || operation.organization !== initial.organization
    || operation.targets.length !== initial.targets.length || operation.targets.some((target, index) => {
      const expected = initial.targets[index];
      return target.repositoryId !== expected.repositoryId || target.repository !== expected.repository
        || target.planDigest !== expected.planDigest || target.baseSha !== expected.baseSha || target.defaultBranch !== expected.defaultBranch;
    })) throw new Error('The saved operation does not match this reviewed plan. Inspect retained effects and start a fresh setup when its base or configuration changed.');
}
export function isSetupBatchInstallationReceipt(value: unknown): value is SetupBatchInstallationReceipt {
  if (!record(value) || !exact(value, ['schemaVersion', 'operationId', 'repositoryId', 'baseSha', 'planDigest'])) return false;
  return value.schemaVersion === 1 && typeof value.operationId === 'string' && uuid.test(value.operationId)
    && positive(value.repositoryId) && typeof value.baseSha === 'string' && sha.test(value.baseSha)
    && typeof value.planDigest === 'string' && digest.test(value.planDigest);
}
export function parseSetupBatchOperation(value: unknown): SetupBatchOperation {
  if (!record(value) || !exact(value, ['schemaVersion', 'operationId', 'organization', 'targets'])
    || value.schemaVersion !== 1 || typeof value.operationId !== 'string' || !uuid.test(value.operationId)
    || typeof value.organization !== 'string' || !name.test(value.organization) || !Array.isArray(value.targets)
    || value.targets.length < 1 || value.targets.length > SETUP_BATCH_MAX_TARGETS) throw new Error('Invalid or unsupported setup operation journal.');
  const ids = new Set<number>();
  for (const target of value.targets) {
    if (!record(target) || Object.keys(target).some(key => !['repositoryId', 'repository', 'defaultBranch', 'baseSha', 'planDigest', 'status', 'effects', 'preparedCommit', 'pullRequestNumber', 'reason'].includes(key))
      || !positive(target.repositoryId) || ids.has(target.repositoryId) || typeof target.repository !== 'string' || !name.test(target.repository)
      || typeof target.defaultBranch !== 'string' || !validBranch(target.defaultBranch) || typeof target.baseSha !== 'string' || !sha.test(target.baseSha)
      || typeof target.planDigest !== 'string' || !digest.test(target.planDigest)
      || !['ready', 'blocked', 'applying', 'partial', 'waiting-for-merge', 'verification-pending', 'unchanged', 'cancelled'].includes(String(target.status))
      || !Array.isArray(target.effects) || new Set(target.effects).size !== target.effects.length
      || target.effects.some(effect => !['access', 'variables', 'labels', 'issue-types', 'branch', 'pull-request'].includes(effect))
      || target.preparedCommit !== undefined && (typeof target.preparedCommit !== 'string' || !sha.test(target.preparedCommit))
      || target.pullRequestNumber !== undefined && !positive(target.pullRequestNumber)
      || target.reason !== undefined && !['preflight', 'drift', 'permission', 'provider', 'ownership', 'cancelled'].includes(String(target.reason))) throw new Error('Invalid setup target receipt.');
    ids.add(target.repositoryId);
    if (target.status === 'waiting-for-merge' && (!target.preparedCommit || !target.pullRequestNumber
      || !target.effects.includes('branch') || !target.effects.includes('pull-request'))) throw new Error('Incomplete setup PR receipt.');
  }
  return JSON.parse(JSON.stringify(value)) as SetupBatchOperation;
}
export function validSetupBatchAssetPath(path: string): boolean {
  if (path.length > 240 || path.split('/').some(part => !part || part === '.' || part === '..') || /[^A-Za-z0-9_./-]/u.test(path)) return false;
  return path === 'AGENTS.md' || path === '.agents/skills/copilot-repository-workflow/SKILL.md'
    || /^\.github\/(?:workflows|ISSUE_TEMPLATE)\/[A-Za-z0-9_.-]+\.(?:yml|yaml)$/u.test(path)
    || path === '.github/pull_request_template.md' || /^\.copilot\/(?:repository-profile|setup-manifest)\.json$/u.test(path)
    || path === '.copilot/AGENT_GUIDE.md' || path.startsWith('.copilot/setup-backups/');
}
function validBranch(value: string): boolean {
  return value.length > 0 && value.length <= 200 && value !== '@' && !value.includes(']') && !/^[/-]|[/.]$|\.\.|@\{|[\p{Cc}\p{Cf}\s~^:?*[\\]/u.test(value)
    && !value.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'));
}
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).length === keys.length && keys.every(key => key in value); }
