import type { SetupRemoteConfigurationReadPort } from '../application/ports/setup_wizard_ports';
import type { SetupBatchDiscoveryPort, SetupBatchInventoryPort } from '../application/ports/setup_batch_ports';
import type { SetupBatchCandidate, SetupBatchFile, SetupBatchSharedResource, SetupBatchSharedMetadata, SetupBatchTarget } from '../domain/setup_batch';
import type { GithubClientPort } from './github/ports/github_client_provider_port';
import type { GithubSetupBatchClient } from './github/ports/github_setup_batch_protocol';
import { validSetupBatchAssetPath } from '../application/policies/setup_batch_policy';
import { SETUP_ORGANIZATION_VARIABLE_BINDINGS } from '../application/policies/setup_organization_variable_bindings';
import { SETUP_CREDENTIAL_HEALTH_BINDINGS } from '../domain/setup_credential_health';
import { setupBatchRateLimitDelay } from '../application/policies/setup_batch_retry_policy';

const managedVariables = new Set([...SETUP_ORGANIZATION_VARIABLE_BINDINGS.flatMap(binding => [binding.variable, binding.fallbackVariable]),
  'PR_APPROVAL_POLICY', 'COPILOT_ISSUE_WORKFLOW_PROFILE', 'AGENT_ALLOWED_PROVIDERS', 'AGENT_ALLOWED_MODEL_PROVIDERS']);

export type BatchRecord = Record<string, unknown>;
export class SetupBatchProviderError extends Error {
  constructor(readonly code: 'forbidden' | 'not-found' | 'rate-limited' | 'transient' | 'malformed' | 'unknown') {
    super(`GitHub setup request is ${code}. Inspect access or retry the pending target.`);
  }
}
export class SetupBatchGithubTransport {
  constructor(private readonly provider: GithubClientPort<GithubSetupBatchClient>, private readonly clock = {
    now: () => Date.now(), wait: (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds)),
  }) {}
  async call(token: string, route: string, parameters: BatchRecord): Promise<unknown> {
    const read = route.startsWith('GET ');
    for (let attempt = 0; attempt < (read ? 3 : 1); attempt += 1) {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new SetupBatchProviderError('transient'));
        }, 15_000); });
        const response = await Promise.race([this.provider.getClient(token).request(route, { ...parameters,
          request: { timeout: 15_000, signal: controller.signal } }), timeout]);
        return response.data;
      } catch (error) {
        const record = batchObject(error);
        const status = record?.status;
        const headers = batchObject(batchObject(record?.response)?.headers);
        const rateLimited = status === 429 || status === 403 && (headers?.['x-ratelimit-remaining'] === '0' || headers?.['retry-after'] !== undefined);
        const code = error instanceof SetupBatchProviderError ? error.code : rateLimited ? 'rate-limited' : status === 403 ? 'forbidden'
          : status === 404 ? 'not-found' : status === 429 ? 'rate-limited'
            : typeof status === 'number' && status >= 500 ? 'transient' : 'unknown';
        if (read && code === 'rate-limited' && attempt < 2) {
          const delay = setupBatchRateLimitDelay(headers, this.clock.now());
          if (delay !== undefined) {
            clearTimeout(timer);
            await this.clock.wait(delay);
            continue;
          }
        }
        if (!read || code !== 'transient' || attempt === 2) throw new SetupBatchProviderError(code);
      } finally { clearTimeout(timer); }
    }
    throw new SetupBatchProviderError('unknown');
  }
}
export class SetupBatchGithubReadAdapter implements SetupBatchDiscoveryPort, SetupBatchInventoryPort {
  constructor(readonly transport: SetupBatchGithubTransport, private readonly remote: SetupRemoteConfigurationReadPort) {}
  async list(organization: string, token: string): Promise<{ targets: readonly SetupBatchCandidate[]; truncated: boolean }> {
    const targets: SetupBatchCandidate[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const response = await this.transport.call(token, 'GET /orgs/{org}/repos', { org: organization, type: 'all', sort: 'full_name', per_page: 100, page });
      if (!Array.isArray(response) || response.length > 100) throw new SetupBatchProviderError('malformed');
      targets.push(...response.map(value => repository(value, organization)));
      if (response.length < 100) return { targets, truncated: false };
    }
    return { targets, truncated: true };
  }
  async resolve(organization: string, name: string, token: string): Promise<SetupBatchTarget> {
    const target = repository(await this.transport.call(token, 'GET /repos/{owner}/{repo}', { owner: organization, repo: name }), organization);
    const response = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}/git/ref/{ref}',
      { owner: organization, repo: name, ref: `heads/${target.defaultBranch}` }));
    const baseSha = batchObject(response?.object)?.sha;
    if (!batchSha(baseSha)) throw new SetupBatchProviderError('malformed');
    return { ...target, baseSha };
  }
  async branchExists(target: SetupBatchTarget, branch: string, token: string): Promise<boolean | undefined> {
    try {
      const result = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}/git/ref/{ref}',
        { owner: target.owner, repo: target.name, ref: `heads/${branch}` }));
      return batchSha(batchObject(result?.object)?.sha) ? true : undefined;
    } catch (error) { return error instanceof SetupBatchProviderError && error.code === 'not-found' ? false : undefined; }
  }
  effective(target: SetupBatchTarget, token: string) { return this.remote.inspect(target.owner, target.name, token); }
  async shared(organization: string, token: string): Promise<readonly SetupBatchSharedResource[]> {
    const resources = await this.sharedMetadata(organization, token);
    const result: SetupBatchSharedResource[] = [];
    for (const resource of resources) result.push({ ...resource, selectedRepositoryIds: resource.visibility === 'selected'
      ? await this.memberships(organization, resource.kind, resource.name, token) : [] });
    return result;
  }
  async sharedMetadata(organization: string, token: string): Promise<readonly SetupBatchSharedMetadata[]> {
    const result: SetupBatchSharedMetadata[] = [];
    for (const kind of ['variable', 'secret'] as const) {
      const plural = kind === 'variable' ? 'variables' : 'secrets';
      const resources = await this.collection(token, `GET /orgs/{org}/actions/${plural}`, { org: organization }, plural);
      const names = new Set<string>();
      for (const value of resources) {
        const name = batchObject(value)?.name;
        if (typeof name === 'string' && !(kind === 'variable' ? managedVariables.has(name)
          : Object.prototype.hasOwnProperty.call(SETUP_CREDENTIAL_HEALTH_BINDINGS, name))) continue;
        const metadata = sharedMetadata(value, kind);
        if (names.has(metadata.name)) throw new SetupBatchProviderError('malformed');
        names.add(metadata.name); result.push(metadata);
      }
    }
    return result.sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`));
  }
  async sharedResource(organization: string, kind: 'variable' | 'secret', name: string, token: string): Promise<SetupBatchSharedResource> {
    const plural = kind === 'variable' ? 'variables' : 'secrets';
    const metadata = sharedMetadata(await this.transport.call(token, `GET /orgs/{org}/actions/${plural}/{name}`,
      { org: organization, name }), kind);
    if (metadata.name !== name) throw new SetupBatchProviderError('malformed');
    return { ...metadata, selectedRepositoryIds: metadata.visibility === 'selected'
      ? await this.memberships(organization, kind, name, token) : [] };
  }
  private async memberships(organization: string, kind: 'variable' | 'secret', name: string, token: string): Promise<readonly number[]> {
    const plural = kind === 'variable' ? 'variables' : 'secrets';
    const selected = await this.collection(token, `GET /orgs/{org}/actions/${plural}/{name}/repositories`, { org: organization, name }, 'repositories');
    const ids = selected.map(item => batchObject(item)?.id);
    if (ids.some(id => !batchPositive(id)) || new Set(ids).size !== ids.length) throw new SetupBatchProviderError('malformed');
    return ids as number[];
  }
  async collection(token: string, route: string, parameters: BatchRecord, key: string): Promise<readonly unknown[]> {
    const result: unknown[] = []; let total: number | undefined;
    // Actions Variable endpoints document a 30-item page maximum. Keep the same
    // bounded 1,000-resource ceiling across Secret and membership inventories.
    const pageSize = 30;
    for (let page = 1; page <= 34; page += 1) {
      const response = batchObject(await this.transport.call(token, route, { ...parameters, per_page: pageSize, page }));
      if (!response || !Number.isSafeInteger(response.total_count) || Number(response.total_count) < 0 || Number(response.total_count) > 1000
        || !Array.isArray(response[key]) || response[key].length > pageSize || total !== undefined && total !== response.total_count) throw new SetupBatchProviderError('malformed');
      total = Number(response.total_count); result.push(...response[key]);
      if (result.length === total) return result;
      if (result.length > total || response[key].length < pageSize) throw new SetupBatchProviderError('malformed');
    }
    throw new SetupBatchProviderError('malformed');
  }
  async files(target: SetupBatchTarget, token: string): Promise<readonly SetupBatchFile[]> {
    const response = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}',
      { owner: target.owner, repo: target.name, tree_sha: target.baseSha, recursive: '1' }));
    if (!response || response.truncated !== false || !Array.isArray(response.tree) || response.tree.length > 100_000) throw new SetupBatchProviderError('malformed');
    const entries = response.tree.map(batchObject).filter(entry => entry?.type !== 'tree' && typeof entry?.path === 'string' && validSetupBatchAssetPath(entry.path));
    if (entries.length > 300) throw new SetupBatchProviderError('malformed');
    const files: SetupBatchFile[] = []; let bytes = 0;
    for (const entry of entries) {
      if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(String(entry.mode))
        || !batchSha(entry.sha) || !Number.isSafeInteger(entry.size) || Number(entry.size) > 100_000) throw new SetupBatchProviderError('malformed');
      bytes += Number(entry.size); if (bytes > 2_000_000) throw new SetupBatchProviderError('malformed');
      const blob = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}/git/blobs/{file_sha}',
        { owner: target.owner, repo: target.name, file_sha: entry.sha }));
      if (!blob || blob.encoding !== 'base64' || typeof blob.content !== 'string' || blob.content.length > 140_000) throw new SetupBatchProviderError('malformed');
      const decoded = Buffer.from(blob.content, 'base64'); const content = decoded.toString('utf8');
      if (decoded.length !== entry.size || !Buffer.from(content).equals(decoded)) throw new SetupBatchProviderError('malformed');
      files.push({ path: entry.path as string, content });
    }
    if (new Set(files.map(file => file.path)).size !== files.length) throw new SetupBatchProviderError('malformed');
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
}
export function batchObject(value: unknown): BatchRecord | undefined { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as BatchRecord : undefined; }
export function batchPositive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
export function batchSha(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value); }
function validDate(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value)); }
function repository(value: unknown, organization: string): SetupBatchCandidate {
  const data = batchObject(value); const owner = batchObject(data?.owner); const permissions = batchObject(data?.permissions);
  if (!data || !owner || !batchPositive(data.id) || !batchPositive(owner.id) || owner.type !== 'Organization'
    || typeof owner.login !== 'string' || owner.login.toLowerCase() !== organization.toLowerCase()
    || typeof data.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u.test(data.name)
    || typeof data.default_branch !== 'string' || typeof data.private !== 'boolean' || typeof data.archived !== 'boolean'
    || typeof data.disabled !== 'boolean') throw new SetupBatchProviderError('malformed');
  return { id: data.id, ownerId: owner.id, owner: owner.login, name: data.name, defaultBranch: data.default_branch,
    private: data.private, archived: data.archived, disabled: data.disabled, canPush: permissions?.push === true || permissions?.admin === true };
}

function sharedMetadata(value: unknown, kind: 'variable' | 'secret'): SetupBatchSharedMetadata {
  const resource = batchObject(value); const name = resource?.name;
  if (!resource || typeof name !== 'string' || !/^[A-Z][A-Z0-9_]{0,99}$/u.test(name)
    || !['all', 'private', 'selected'].includes(String(resource.visibility)) || !validDate(resource.updated_at)
    || kind === 'variable' && (typeof resource.value !== 'string' || Buffer.byteLength(resource.value) > 30_000)) throw new SetupBatchProviderError('malformed');
  const metadata = { name, updatedAt: resource.updated_at as string, visibility: resource.visibility as SetupBatchSharedResource['visibility'] };
  return kind === 'secret' ? { ...metadata, kind } : { ...metadata, kind, value: resource.value as string };
}
