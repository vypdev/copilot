import { createHash } from 'node:crypto';
import type { SetupBatchFile } from '../../domain/setup_batch';
import { SETUP_PUBLISHER_PURPOSE, SETUP_PUBLISHER_WORKFLOW_PATH, type SetupPublisherInspection,
  type SetupPublisherObservedFile, type SetupPublisherPlan, type SetupPublisherProposal } from '../../domain/setup_publisher_installation';
import { setupBatchBranch, validateSetupBatchTargets } from './setup_batch_policy';
import { setupInstallationFiles, SETUP_INSTALLATION_MANIFEST_PATH } from './setup_installation_receipt_policy';
import { parseSetupPublisherProposal, setupPublisherWorkflow } from './setup_publisher_installation_policy';
import { setupPublisherInventoryFactForPlan } from './setup_publisher_inventory_review_policy';
import { parseRepositoryAgentGuidanceManifest, REPOSITORY_AGENT_GUIDE_PATH, REPOSITORY_AGENT_POINTER_END,
  REPOSITORY_AGENT_POINTER_PATH, REPOSITORY_AGENT_POINTER_START, REPOSITORY_AGENT_PROFILE_PATH,
  REPOSITORY_AGENT_SKILL_PATH, validRepositoryAgentProfile } from './repository_agent_guidance_policy';

export type SetupPublisherPlanFailure = 'destination-changed' | 'authority-unverified' | 'source-unverified' | 'installation-unsupported';
export class SetupPublisherPlanError extends Error {
  constructor(readonly reason: SetupPublisherPlanFailure) { super(`Publisher installation review is blocked: ${reason}.`); }
}

const sha256 = (content: string): string => createHash('sha256').update(content, 'utf8').digest('hex');
const positive = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
const regular = (file: SetupPublisherObservedFile): boolean => ['100644', '100755'].includes(file.mode);
const requiredGuidance = [REPOSITORY_AGENT_PROFILE_PATH, REPOSITORY_AGENT_GUIDE_PATH, REPOSITORY_AGENT_SKILL_PATH];

/** Fixed transformation and receipt derivation. No renderer, credential, transport or write authority. */
export function planSetupPublisherInstallation(input: SetupPublisherProposal, inspection: SetupPublisherInspection,
  operationId: string): SetupPublisherPlan {
  const proposal = parseSetupPublisherProposal(input);
  setupBatchBranch(operationId);
  const { target, authority, source, installation } = inspection;
  if (validateSetupBatchTargets(target.owner, [target]).length || typeof target.private !== 'boolean'
    || target.archived !== false || target.disabled !== false || target.canPush !== true
    || target.id !== proposal.destination.repositoryId || `${target.owner}/${target.name}`.toLowerCase() !== proposal.destination.repository.toLowerCase()
    || target.defaultBranch !== proposal.destination.defaultBranch || target.baseSha !== proposal.destination.head) {
    throw new SetupPublisherPlanError('destination-changed');
  }
  if (!positive(authority.actorId) || authority.repositoryId !== target.id
    || authority.contents !== 'write' || authority.pullRequests !== 'write' || authority.workflows !== 'write') {
    throw new SetupPublisherPlanError('authority-unverified');
  }
  const boundTarget = { id: target.id, ownerId: target.ownerId, owner: target.owner, name: target.name,
    defaultBranch: target.defaultBranch, baseSha: target.baseSha, private: target.private,
    archived: target.archived, disabled: target.disabled, canPush: target.canPush };
  if (source.repository !== proposal.source.repository || !positive(source.repositoryId)
    || source.commit !== proposal.source.commit || source.pullRequest !== proposal.source.pullRequest
    || source.reviewedRevision !== source.commit || source.mergedRevision !== source.commit
    || typeof source.workflow !== 'string' || Buffer.byteLength(source.workflow, 'utf8') > 100_000 || source.workflow.includes('\0')
    || sha256(source.workflow) !== proposal.source.workflowSha256
    || source.actionManifestSha256 !== proposal.source.actionManifestSha256 || source.actionBundleSha256 !== proposal.source.actionBundleSha256) {
    throw new SetupPublisherPlanError('source-unverified');
  }
  let workflow: string;
  try { workflow = setupPublisherWorkflow(source.workflow, source.commit); }
  catch { throw new SetupPublisherPlanError('source-unverified'); }
  if (sha256(workflow) !== proposal.proposedWorkflowSha256) throw new SetupPublisherPlanError('source-unverified');
  const manifest = compatibleManifest(inspection);
  const workflows = uniqueFiles(installation.workflows);
  const existing = workflows.get(SETUP_PUBLISHER_WORKFLOW_PATH);
  const publisher = installation.publisher;
  const unchanged = publisher.kind === 'exact' && publisher.paths.length === 1 && publisher.paths[0] === SETUP_PUBLISHER_WORKFLOW_PATH
    && existing?.mode === '100644' && existing.content === workflow;
  if (!unchanged && (publisher.kind !== 'absent' || publisher.paths.length !== 0 || existing !== undefined)) {
    throw new SetupPublisherPlanError('installation-unsupported');
  }
  // A version2 locator is not authority. Only the authenticated reader can
  // supply the independent review fact, freshly bound to this complete set.
  const inventoryReview = proposal.schemaVersion === 2 ? setupPublisherInventoryFactForPlan(proposal.inventoryReview,
    installation.inventoryReview, installation.workflows) : undefined;
  // Include only audited public identity/authority facts. Session generation is
  // fenced privately by orchestration, never a credential hash in this digest.
  const identity = { purpose: SETUP_PUBLISHER_PURPOSE, operationId, receiptSchemaVersion: 1, target: boundTarget,
    authority: { actorId: authority.actorId, repositoryId: authority.repositoryId, contents: authority.contents,
      pullRequests: authority.pullRequests, workflows: authority.workflows },
    source: { repository: source.repository, repositoryId: source.repositoryId, commit: source.commit,
      pullRequest: source.pullRequest, reviewedRevision: source.reviewedRevision, mergedRevision: source.mergedRevision,
      workflowSha256: proposal.source.workflowSha256, actionManifestSha256: source.actionManifestSha256,
      actionBundleSha256: source.actionBundleSha256 },
    workflowSha256: sha256(workflow), originalManifestSha256: sha256(installation.manifest!.content),
    ...(inventoryReview ? { inventoryReview } : {}) };
  const digest = sha256(JSON.stringify(identity));
  const files = unchanged ? [] : setupInstallationFiles([{ path: SETUP_PUBLISHER_WORKFLOW_PATH, content: workflow }], manifest,
    { schemaVersion: 1, operationId, repositoryId: target.id, baseSha: target.baseSha, planDigest: digest });
  return Object.freeze({ purpose: SETUP_PUBLISHER_PURPOSE, operationId, target: Object.freeze(boundTarget),
    actorId: authority.actorId, sourceCommit: source.commit, status: unchanged ? 'unchanged' : 'review', digest,
    approvalDigest: unchanged ? null : approvalDigest(digest, files), files: Object.freeze(files.map(file => Object.freeze({ ...file }))),
    nativeVerification: 'pending', ...(inventoryReview ? { inventoryReview } : {}) });
}

/** Byte identity only; a serialized plan or matching digest never grants Apply. */
export function setupPublisherApprovalMatches(plan: SetupPublisherPlan, files: readonly SetupBatchFile[]): boolean {
  return plan.purpose === SETUP_PUBLISHER_PURPOSE && plan.status === 'review' && files.length === 2
    && files[0].path === SETUP_PUBLISHER_WORKFLOW_PATH && files[1].path === SETUP_INSTALLATION_MANIFEST_PATH
    && files.every(file => Object.keys(file).sort().join(',') === 'content,path' && typeof file.content === 'string')
    && approvalDigest(plan.digest, files) === plan.approvalDigest;
}

function approvalDigest(digest: string, files: readonly SetupBatchFile[]): string {
  return sha256(JSON.stringify({ purpose: 'bugbot-status-publisher:approved-bytes:v1', planDigest: digest,
    files: files.map(file => ({ path: file.path, content: file.content })) }));
}

function compatibleManifest(inspection: SetupPublisherInspection): object {
  const { installation, target } = inspection, file = installation.manifest;
  if (installation.complete !== true || !file || file.path !== SETUP_INSTALLATION_MANIFEST_PATH || file.mode !== '100644'
    || typeof file.content !== 'string' || Buffer.byteLength(file.content, 'utf8') > 100_000) throw new SetupPublisherPlanError('installation-unsupported');
  const manifest = parseRepositoryAgentGuidanceManifest(file.content);
  if (!manifest || manifest.installation && manifest.installation.repositoryId !== target.id
    || requiredGuidance.some(path => !manifest.artifacts[path])) throw new SetupPublisherPlanError('installation-unsupported');
  const guidance = uniqueFiles(installation.guidance);
  for (const [path, artifact] of Object.entries(manifest.artifacts)) {
    const observed = guidance.get(path);
    if (!observed || !regular(observed)) throw new SetupPublisherPlanError('installation-unsupported');
    const content = path === REPOSITORY_AGENT_POINTER_PATH ? pointer(observed.content) : observed.content;
    if (content === undefined || sha256(content.replace(/\r\n/gu, '\n')) !== artifact.sha256) throw new SetupPublisherPlanError('installation-unsupported');
  }
  const profile = guidance.get(REPOSITORY_AGENT_PROFILE_PATH)!.content;
  if (!validRepositoryAgentProfile(profile) || sha256(profile.replace(/\r\n/gu, '\n')) !== manifest.profileDigest) {
    throw new SetupPublisherPlanError('installation-unsupported');
  }
  return JSON.parse(file.content) as object;
}

function uniqueFiles(files: readonly SetupPublisherObservedFile[]): ReadonlyMap<string, SetupPublisherObservedFile> {
  const result = new Map<string, SetupPublisherObservedFile>();
  if (!Array.isArray(files)) throw new SetupPublisherPlanError('installation-unsupported');
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string'
      || Buffer.byteLength(file.content, 'utf8') > 100_000 || result.has(file.path) || !regular(file)) {
      throw new SetupPublisherPlanError('installation-unsupported');
    }
    result.set(file.path, file);
  }
  return result;
}

function pointer(content: string): string | undefined {
  const start = content.indexOf(REPOSITORY_AGENT_POINTER_START), end = content.indexOf(REPOSITORY_AGENT_POINTER_END);
  if (start < 0 || end < start) return undefined;
  const after = end + REPOSITORY_AGENT_POINTER_END.length;
  if (content.indexOf(REPOSITORY_AGENT_POINTER_START, start + 1) >= 0 || content.indexOf(REPOSITORY_AGENT_POINTER_END, after) >= 0) return undefined;
  return content.slice(start, after);
}
