import { hasDuplicateJsonObjectKeys } from '../../../domain/strict_json_keys';
import { readConfigurationBlock } from '../../../manager/description/configuration_markers';
import { requireCurrentConfigurationPayload } from '../../model/config';
import { readDeploymentOperationState } from '../../../domain/deployment_state_fence';
import { ApplicationError } from '../../../application/errors/application_error';
import type { DeploymentCandidateInspectionPort, DeploymentCandidateLauncherReadPort, DeploymentCandidateLauncher, DeploymentCandidateWorkflowRunReadPort, DeploymentCandidateWorkflowRun, DeploymentCandidatePreparationScope } from '../../../application/ports/deployment_candidate_inspection_ports';
import type { DeploymentCandidateReplacementEvidence } from '../../../domain/deployment_candidate_replacement';
import { parseManagedPullRequestMarker } from '../../../domain/managed_pull_request';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubCandidateReplacementProviderClient } from '../../../infrastructure/github/ports/github_candidate_replacement_provider_port';
import { requireNativeCandidatePreparation } from './native_candidate_preparation';
import { isGithubNotFound } from '../github/github_error_policy';

type Command = Parameters<DeploymentCandidateInspectionPort['inspect']>[0];
type Client = GithubCandidateReplacementProviderClient;
type Promotion = DeploymentCandidateReplacementEvidence['promotion'];
const MAX_RELEASE_PAGES = 10;

/** Native reads only; neither an API error nor a missing DTO certifies vacancy. */
export class GithubCandidateReplacementRepository implements DeploymentCandidateInspectionPort, DeploymentCandidateLauncherReadPort, DeploymentCandidateWorkflowRunReadPort {
  constructor(private readonly clientProvider: GithubClientPort<Client>, private readonly preparationScope?: DeploymentCandidatePreparationScope) {}

  async readLauncher(command: Parameters<DeploymentCandidateLauncherReadPort['readLauncher']>[0]): Promise<DeploymentCandidateLauncher> {
    try {
      return await readLauncher(this.clientProvider.getClient(command.token), { owner: command.owner, repo: command.repository }, command.issue);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('provider.unavailable', 'Native candidate launcher could not be confirmed.', { retryable: true });
    }
  }

  async readWorkflowRun(command: Parameters<DeploymentCandidateWorkflowRunReadPort['readWorkflowRun']>[0]): Promise<DeploymentCandidateWorkflowRun> {
    try {
      const { data } = await this.clientProvider.getClient(command.token).request<unknown>(
        'GET /repos/{owner}/{repo}/actions/runs/{run_id}', { owner: command.owner, repo: command.repository, run_id: command.runId });
      const native = record(data); const repository = record(native.repository); const headRepository = record(native.head_repository);
      if (native.id !== command.runId || !Number.isSafeInteger(native.run_attempt) || Number(native.run_attempt) < 1
        || typeof repository.full_name !== 'string' || typeof headRepository.full_name !== 'string'
        || typeof native.head_branch !== 'string' || typeof native.event !== 'string'
        || typeof native.path !== 'string' || typeof native.status !== 'string') return invalid('Native preparation run identity is incomplete.');
      return Object.freeze({ id: command.runId, attempt: native.run_attempt as number, repositoryFullName: repository.full_name,
        headRepositoryFullName: headRepository.full_name, headBranch: native.head_branch, headSha: sha(native.head_sha),
        event: native.event, path: native.path, status: native.status });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('provider.unavailable', 'Native preparation run could not be confirmed.', { retryable: true });
    }
  }

  async inspect(command: Command): Promise<DeploymentCandidateReplacementEvidence> {
    try {
      const client = this.clientProvider.getClient(command.token);
      const parameters = { owner: command.owner, repo: command.repository };
      const [sourceSha, productionSha, promotion, launcher] = await Promise.all([
        branchSha(client, parameters, command.sourceBranch),
        branchSha(client, parameters, command.productionBranch),
        readPromotion(client, parameters, command.promotionPullRequest),
        readLauncher(client, parameters, command.issue),
      ]);
      if (command.preparation) {
        await requireNativeCandidatePreparation(client, parameters, command, launcher, sourceSha, this.preparationScope);
      }
      const [oldSourceReachable, reviewedSourceReachable, oldSourceInProduction, closedPromotionHeadReachable, conflictingOpenPromotion, nativePublicationVacant, queued] = await Promise.all([
        reachable(client, parameters, command.sourceSha, sourceSha),
        reachable(client, parameters, command.reviewedSourceSha, sourceSha),
        reachable(client, parameters, command.sourceSha, productionSha),
        reachable(client, parameters, promotion.headSha, sourceSha),
        hasOpenPromotion(client, parameters, command),
        publicationVacant(client, parameters, `v${command.version}`),
        queuedPromotion(client, promotion.nodeId),
      ]);
      // Inventory and producer reads may take time. Recheck only the pinned refs,
      // rather than repeating the complete inspection and publication inventory.
      const [finalSourceSha, finalProductionSha] = await Promise.all([
        branchSha(client, parameters, command.sourceBranch),
        branchSha(client, parameters, command.productionBranch),
      ]);
      if (finalSourceSha !== sourceSha || finalProductionSha !== productionSha) {
        throw new ApplicationError('workflow.stale', 'Native source or production changed during candidate inspection. Existing deployment state was retained.');
      }
      return Object.freeze({ launcher: Object.freeze({ open: launcher.open, operationId: launcher.operation.operationId,
        revision: launcher.operation.revision, kind: launcher.kind, sourceBranch: launcher.sourceBranch }), sourceSha, productionSha, oldSourceReachable, reviewedSourceReachable, oldSourceInProduction,
        closedPromotionHeadReachable, conflictingOpenPromotion, nativePublicationVacant,
        promotion: Object.freeze({ ...promotion.record, queued }),
      });
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      // No private SDK message, headers, URL, credential or response body crosses the port.
      throw new ApplicationError('provider.unavailable', 'Native unpublished-candidate inspection could not be confirmed.', { retryable: true });
    }
  }
}

async function readLauncher(client: Client, parameters: Record<string, string>, issue: number): Promise<DeploymentCandidateLauncher> {
  const { data } = await client.request<unknown>('GET /repos/{owner}/{repo}/issues/{issue_number}', { ...parameters, issue_number: issue });
  const native = record(data);
  if (native.number !== issue || !Number.isSafeInteger(native.id) || Number(native.id) < 1
    || Object.prototype.hasOwnProperty.call(native, 'pull_request')
    || (native.state !== 'open' && native.state !== 'closed') || typeof native.body !== 'string'
    || Buffer.byteLength(native.body, 'utf8') > 1_048_576) return invalid('Native candidate launcher is incomplete.');
  const block = readConfigurationBlock(native.body);
  if (block.kind !== 'present' || hasDuplicateJsonObjectKeys(block.content)) return invalid('Candidate launcher configuration is missing or ambiguous.');
  const configuration = requireCurrentConfigurationPayload(JSON.parse(block.content));
  const loaded = readDeploymentOperationState(configuration.deploymentOrchestration);
  if (loaded.kind !== 'current' || configuration.branchType !== loaded.operation.kind) {
    return invalid('Candidate launcher has no matching current deployment identity.');
  }
  const sourceBranch = loaded.operation.kind === 'release' ? configuration.releaseBranch : configuration.hotfixBranch;
  if (sourceBranch !== loaded.operation.sourceBranch) return invalid('Candidate launcher branch ownership is inconsistent.');
  if (!Array.isArray(native.labels)) return invalid('Native issue workflow labels are unavailable.');
  const labels = native.labels.map(value => {
    const name = typeof value === 'string' ? value : record(value).name;
    if (typeof name !== 'string' || !name) return invalid('Native issue workflow label is incomplete.');
    return name;
  });
  return Object.freeze({ issue, open: native.state === 'open', operation: loaded.operation, kind: loaded.operation.kind, sourceBranch,
    admission: Object.freeze({ labels: Object.freeze(labels), body: native.body }),
  });
}

async function branchSha(client: Client, parameters: Record<string, string>, branch: string): Promise<string> {
  const { data } = await client.request<unknown>('GET /repos/{owner}/{repo}/git/ref/{ref}', { ...parameters, ref: `heads/${branch}` });
  const object = record(record(data).object);
  if (object.type !== 'commit') return invalid('Branch authority is not a native commit.');
  return sha(object.sha);
}

async function reachable(client: Client, parameters: Record<string, string>, base: string, head: string): Promise<boolean> {
  if (base === head) return true;
  const { data } = await client.request<unknown>('GET /repos/{owner}/{repo}/compare/{basehead}', { ...parameters, basehead: `${base}...${head}` });
  const status = record(data).status;
  if (typeof status !== 'string' || !['ahead', 'behind', 'diverged', 'identical'].includes(status)) return invalid('Native ancestry could not be confirmed.');
  return status === 'ahead' || status === 'identical';
}

async function readPromotion(client: Client, parameters: Record<string, string>, expectedNumber: number): Promise<{ readonly nodeId: string; readonly headSha: string; readonly record: Omit<Promotion, 'queued'> }> {
  const { data } = await client.request<unknown>('GET /repos/{owner}/{repo}/pulls/{pull_number}', { ...parameters, pull_number: expectedNumber });
  const pr = record(data); const head = record(pr.head); const base = record(pr.base);
  const expectedRepository = `${parameters.owner}/${parameters.repo}`.toLowerCase();
  const headRepository = record(head.repo).full_name; const baseRepository = record(base.repo).full_name;
  if (typeof headRepository !== 'string' || typeof baseRepository !== 'string'
    || headRepository.toLowerCase() !== expectedRepository || baseRepository.toLowerCase() !== expectedRepository) {
    return invalid('Candidate promotion repository could not be confirmed.');
  }
  const marker = typeof pr.body === 'string' ? parseManagedPullRequestMarker(pr.body) : undefined;
  if (!marker || (pr.body as string).length > 65_536
    || Array.from((pr.body as string).matchAll(/<!-- copilot-deployment operation-id=/g)).length !== 1
    || pr.number !== expectedNumber || typeof pr.node_id !== 'string' || !pr.node_id
    || (typeof pr.state !== 'string' || !['open', 'closed'].includes(pr.state)) || typeof pr.merged !== 'boolean'
    || !(pr.merged_at === null || typeof pr.merged_at === 'string')
    || !(pr.auto_merge === null || !!pr.auto_merge && typeof pr.auto_merge === 'object')
    || typeof head.ref !== 'string' || !head.ref || typeof base.ref !== 'string' || !base.ref) {
    return invalid('Candidate promotion identity is incomplete or ambiguous.');
  }
  const headSha = sha(head.sha);
  return { nodeId: pr.node_id, headSha, record: {
    number: expectedNumber, repositoryFullName: headRepository,
    operationId: marker.operationId, issue: marker.issue, phase: marker.phase,
    sourceBranch: head.ref, headSha, productionBranch: base.ref, closed: pr.state === 'closed',
    merged: pr.merged || pr.merged_at !== null, autoMergeEnabled: pr.auto_merge !== null,
  } };
}

async function queuedPromotion(client: Client, nodeId: string): Promise<boolean> {
  const response = record(await client.graphql<unknown>(`
    query CandidateReplacementQueue($id: ID!) {
      node(id: $id) { ... on PullRequest { id mergeQueueEntry { id } } }
    }
  `, { id: nodeId }));
  const node = record(response.node);
  if (node.id !== nodeId || !Object.prototype.hasOwnProperty.call(node, 'mergeQueueEntry')) return invalid('Native merge-queue membership is unavailable.');
  if (node.mergeQueueEntry === null) return false;
  const entry = record(node.mergeQueueEntry);
  if (typeof entry.id !== 'string' || !entry.id) return invalid('Native merge-queue entry is incomplete.');
  return true;
}

async function hasOpenPromotion(client: Client, parameters: Record<string, string>, command: Command): Promise<boolean> {
  const { data } = await client.request<unknown>('GET /repos/{owner}/{repo}/pulls', {
    ...parameters, state: 'open', head: `${parameters.owner}:${command.sourceBranch}`, base: command.productionBranch, per_page: 2,
  });
  if (!Array.isArray(data)) return invalid('Open promotion inventory is unavailable.');
  if (data.length === 0) return false;
  const allowed = command.allowedCurrentPromotion;
  if (!allowed || data.length !== 1) return true;
  const number = record(data[0]).number;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 1) return invalid('Open promotion identity is unavailable.');
  const current = (await readPromotion(client, parameters, number)).record;
  return current.operationId !== allowed.operationId || current.issue !== command.issue || current.phase !== 'promotion'
    || current.sourceBranch !== command.sourceBranch || current.productionBranch !== command.productionBranch
    || current.headSha !== allowed.sourceSha || current.closed || current.merged
    || (allowed.pullRequest !== undefined && current.number !== allowed.pullRequest);
}

async function publicationVacant(client: Client, parameters: Record<string, string>, tag: string): Promise<boolean> {
  try {
    await client.request<unknown>('GET /repos/{owner}/{repo}/git/ref/{ref}', { ...parameters, ref: `tags/${tag}` });
    return false;
  } catch (error) {
    if (!isGithubNotFound(error)) throw error;
  }
  // Only a native principal with push access can see draft releases. An empty
  // public/read-only listing must never certify vacancy.
  const repository = record((await client.request<unknown>('GET /repos/{owner}/{repo}', parameters)).data);
  const permissions = record(repository.permissions);
  if (typeof repository.full_name !== 'string'
    || repository.full_name.toLowerCase() !== `${parameters.owner}/${parameters.repo}`.toLowerCase()
    || permissions.push !== true) return invalid('Native authority cannot confirm draft-release visibility.');
  // Inspect every bounded page, including drafts.
  for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
    const { data } = await client.request<unknown>('GET /repos/{owner}/{repo}/releases', { ...parameters, per_page: 100, page });
    if (!Array.isArray(data) || data.some(value => typeof record(value).tag_name !== 'string')) {
      return invalid('Native release inventory is unavailable.');
    }
    if (data.some(value => record(value).tag_name === tag)) return false;
    if (data.length < 100) return true;
  }
  return invalid('Native release inventory exceeded the bounded inspection.');
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Native candidate authority is incomplete.');
  return value as Record<string, unknown>;
}
function sha(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/i.test(value)) return invalid('Native candidate commit identity is unavailable.');
  return value.toLowerCase();
}
function invalid(message: string): never {
  throw new ApplicationError('provider.contract-invalid', message);
}
