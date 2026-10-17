import type { SetupBatchApplyPort } from '../application/ports/setup_batch_ports';
import type { SetupBatchGrant, SetupBatchTargetPlan, SetupBatchTargetReceipt } from '../domain/setup_batch';
import type { SetupRepositoryVariablesCommandPort } from '../application/ports/setup_wizard_ports';
import { isSetupBatchInstallationReceipt, setupBatchBranch, setupBatchMarker } from '../application/policies/setup_batch_policy';
import { batchObject, batchPositive, batchSha, SetupBatchGithubReadAdapter, SetupBatchProviderError } from './setup_batch_github_read_adapter';
import { createHash } from 'node:crypto';

/** Reused shared resources have an additive access command only. No shared value or Secret writer is injected. */
export class SetupBatchGithubApplyAdapter implements SetupBatchApplyPort {
  private readonly ownAccessRevisions = new Map<string, { readonly before: string; readonly after: string }>();
  constructor(private readonly read: SetupBatchGithubReadAdapter, private readonly variableWriter: SetupRepositoryVariablesCommandPort,
    private readonly resources: { labels(plan: SetupBatchTargetPlan, token: string): Promise<void>;
      issueTypes(plan: SetupBatchTargetPlan, token: string): Promise<void> }) {}
  async revalidate(plan: SetupBatchTargetPlan, token: string, completed: SetupBatchTargetReceipt['effects']): Promise<boolean> {
    const fresh = await this.read.resolve(plan.target.owner, plan.target.name, token);
    if (JSON.stringify(fresh) !== JSON.stringify(plan.target) || fresh.archived || fresh.disabled || !fresh.canPush) return false;
    if (plan.configuration.repository.developmentBranch !== fresh.defaultBranch
      && await this.read.branchExists(fresh, plan.configuration.repository.developmentBranch, token) !== true) return false;
    const shared = await this.read.sharedMetadata(fresh.owner, token);
    for (const expected of plan.sharedSnapshot) {
      const current = shared.find(resource => resource.kind === expected.kind && resource.name === expected.name);
      if (!current || current.value !== expected.value || current.updatedAt !== this.sharedRevision(plan.target.owner, expected) || current.visibility !== expected.visibility) return false;
    }
    const effective = await this.read.effective(fresh, token);
    if (effective.repositoryVariablesAccess !== 'available' || effective.repositorySecretsAccess !== 'available'
      || effective.organizationVariablesAccess !== 'available' || effective.organizationSecretsAccess !== 'available') return false;
    for (const resource of plan.sharedSnapshot) {
      const pendingGrant = !completed.includes('access') && plan.grants.some(grant => grant.kind === resource.kind && grant.name === resource.name);
      if (!pendingGrant && (resource.kind === 'secret' ? !effective.organizationSecrets.includes(resource.name)
        : !effective.organizationVariables.some(variable => variable.name === resource.name && variable.value === resource.value))) return false;
    }
    const revisions = (remote: SetupBatchTargetPlan['remote']) => remote.repositorySecretRevisions?.map(secret => JSON.stringify([secret.name, secret.updatedAt])).sort();
    if (JSON.stringify(revisions(effective)) !== JSON.stringify(revisions(plan.remote))) return false;
    if (JSON.stringify([...effective.repositorySecrets].sort()) !== JSON.stringify([...plan.remote.repositorySecrets].sort())) return false;
    const original = new Map(plan.remote.repositoryVariables.map(variable => [variable.name, variable.value]));
    const intended = new Map(plan.repositoryVariables.map(variable => [variable.name, variable.value]));
    for (const variable of effective.repositoryVariables) {
      if (variable.value !== original.get(variable.name) && variable.value !== intended.get(variable.name)) return false;
      original.delete(variable.name);
    }
    return original.size === 0;
  }
  async grant(plan: SetupBatchTargetPlan, grant: SetupBatchGrant, token: string): Promise<void> {
    if (grant.repositoryId !== plan.target.id || !plan.grants.some(item => item.kind === grant.kind && item.name === grant.name && item.repositoryId === grant.repositoryId)) throw new SetupBatchProviderError('malformed');
    const expected = plan.sharedSnapshot.find(resource => resource.kind === grant.kind && resource.name === grant.name);
    const current = await this.read.sharedResource(plan.target.owner, grant.kind, grant.name, token);
    if (!expected || !current || current.visibility !== 'selected' || current.value !== expected.value || current.updatedAt !== this.sharedRevision(plan.target.owner, expected)
      || expected.selectedRepositoryIds.some(id => !current.selectedRepositoryIds.includes(id))) throw new SetupBatchProviderError('unknown');
    if (current.selectedRepositoryIds.includes(grant.repositoryId)) return;
    const plural = grant.kind === 'variable' ? 'variables' : 'secrets';
    let attempted: unknown;
    try {
      await this.read.transport.call(token, `PUT /orgs/{org}/actions/${plural}/{name}/repositories/{repository_id}`,
        { org: plan.target.owner, name: grant.name, repository_id: grant.repositoryId });
    } catch (error) { attempted = error; }
    const observed = await this.read.sharedResource(plan.target.owner, grant.kind, grant.name, token);
    if (!observed || observed.visibility !== 'selected' || observed.value !== expected.value
      || !observed.selectedRepositoryIds.includes(grant.repositoryId)
      || current.selectedRepositoryIds.some(id => !observed.selectedRepositoryIds.includes(id))) throw attempted ?? new SetupBatchProviderError('unknown');
    const key = `${plan.target.owner}/${expected.kind}/${expected.name}`;
    this.ownAccessRevisions.set(key, { before: this.ownAccessRevisions.get(key)?.before ?? expected.updatedAt, after: observed.updatedAt });
  }
  async variables(plan: SetupBatchTargetPlan, token: string): Promise<void> {
    for (const variable of plan.repositoryVariables) {
      const fresh = await this.read.effective(plan.target, token);
      if (fresh.repositoryVariablesAccess !== 'available') throw new SetupBatchProviderError('forbidden');
      const current = fresh.repositoryVariables.find(item => item.name === variable.name);
      if (current?.value === variable.value) continue;
      const original = plan.remote.repositoryVariables.find(item => item.name === variable.name);
      if (current?.value !== original?.value) throw new SetupBatchProviderError('unknown');
      const result = await this.variableWriter.upsert(plan.target.owner, plan.target.name, token, [variable]);
      if (result.errors.length > 0) throw new SetupBatchProviderError('unknown');
    }
  }
  labels(plan: SetupBatchTargetPlan, token: string) { return this.resources.labels(plan, token); }
  issueTypes(plan: SetupBatchTargetPlan, token: string) { return this.resources.issueTypes(plan, token); }
  async prepareCommit(plan: SetupBatchTargetPlan, operationId: string, token: string): Promise<string> {
    if (!await this.revalidate(plan, token, [])) throw new SetupBatchProviderError('unknown');
    const coordinates = { owner: plan.target.owner, repo: plan.target.name };
    const base = batchObject(await this.read.transport.call(token, 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}', { ...coordinates, commit_sha: plan.target.baseSha }));
    const baseTree = batchObject(base?.tree)?.sha;
    if (!batchSha(baseTree)) throw new SetupBatchProviderError('malformed');
    const manifestPath = '.copilot/setup-manifest.json';
    let manifest = plan.files.find(file => file.path === manifestPath)?.content;
    if (!manifest) manifest = (await this.read.files(plan.target, token)).find(file => file.path === manifestPath)?.content;
    const parsed = manifest ? batchObject(JSON.parse(manifest)) : { schemaVersion: 2,
      generator: { name: '@vypdev/copilot', contractVersion: 1 }, artifacts: {}, profileDigest: createHash('sha256').update('').digest('hex') };
    if (!parsed) throw new SetupBatchProviderError('malformed');
    const installation = { schemaVersion: 1, operationId, repositoryId: plan.target.id, baseSha: plan.target.baseSha, planDigest: plan.digest };
    if (!isSetupBatchInstallationReceipt(installation)) throw new SetupBatchProviderError('malformed');
    const files = [...plan.files.filter(file => file.path !== manifestPath), { path: manifestPath, content: `${JSON.stringify({ ...parsed, installation }, null, 2)}\n` }];
    const tree = batchObject(await this.read.transport.call(token, 'POST /repos/{owner}/{repo}/git/trees', { ...coordinates, base_tree: baseTree,
      tree: files.map(file => ({ path: file.path, type: 'blob', mode: '100644', ...(file.content === null ? { sha: null } : { content: file.content }) })) }));
    if (!batchSha(tree?.sha)) throw new SetupBatchProviderError('malformed');
    const commit = batchObject(await this.read.transport.call(token, 'POST /repos/{owner}/{repo}/git/commits', { ...coordinates, tree: tree.sha,
      parents: [plan.target.baseSha], message: `chore: configure Copilot (setup ${operationId})` }));
    if (!batchSha(commit?.sha)) throw new SetupBatchProviderError('malformed');
    await this.assertPrepared(plan, operationId, commit.sha, token);
    return commit.sha;
  }
  async branch(plan: SetupBatchTargetPlan, operationId: string, commit: string, token: string): Promise<void> {
    const ref = setupBatchBranch(operationId);
    await this.assertPrepared(plan, operationId, commit, token);
    const current = await this.branchSha(plan, ref, token);
    if (current) { if (current !== commit) throw new SetupBatchProviderError('unknown'); return; }
    try {
      await this.read.transport.call(token, 'POST /repos/{owner}/{repo}/git/refs', { owner: plan.target.owner, repo: plan.target.name, ref: `refs/heads/${ref}`, sha: commit });
    } catch { /* An uncertain create must be inspected, never retried blindly. */ }
    if (await this.branchSha(plan, ref, token) !== commit) throw new SetupBatchProviderError('unknown');
  }
  async pullRequest(plan: SetupBatchTargetPlan, operationId: string, commit: string, token: string): Promise<number> {
    const branch = setupBatchBranch(operationId);
    if (await this.branchSha(plan, branch, token) !== commit) throw new SetupBatchProviderError('unknown');
    await this.assertPrepared(plan, operationId, commit, token);
    const inspect = async (): Promise<number | undefined> => {
      let match: number | undefined;
      for (let page = 1; page <= 10; page += 1) {
        const response = await this.read.transport.call(token, 'GET /repos/{owner}/{repo}/pulls',
          { owner: plan.target.owner, repo: plan.target.name, state: 'all', per_page: 100, page });
        if (!Array.isArray(response) || response.length > 100) throw new SetupBatchProviderError('malformed');
        for (const value of response) {
          const pull = batchObject(value); const head = batchObject(pull?.head); const base = batchObject(pull?.base);
          if (typeof head?.ref !== 'string' || !head.ref.startsWith('setup/copilot/')) continue;
          if (pull?.state !== 'open' && head.ref !== branch) continue;
          if (pull?.state !== 'open' || head.ref !== branch || head.sha !== commit || batchObject(head.repo)?.id !== plan.target.id
            || base?.ref !== plan.target.defaultBranch || typeof pull?.body !== 'string'
            || !pull.body.includes(setupBatchMarker(operationId, plan.target.id)) || !batchPositive(pull.number) || match !== undefined) throw new SetupBatchProviderError('unknown');
          match = pull.number;
        }
        if (response.length < 100) return match;
      }
      throw new SetupBatchProviderError('malformed');
    };
    const existing = await inspect(); if (existing) return existing;
    try {
      await this.read.transport.call(token, 'POST /repos/{owner}/{repo}/pulls', { owner: plan.target.owner, repo: plan.target.name,
        head: branch, base: plan.target.defaultBranch, title: 'chore: configure Copilot',
        body: `${setupBatchMarker(operationId, plan.target.id)}\n\nConfigure Copilot using the reviewed setup plan. Shared Secret values are retained.\n\n**Status:** PR created; installation awaits human review and merge. Runtime credential and capability verification remain pending.\n\nReview the generated workflows, repository guidance and configuration before merging. Setup never merges, releases or deploys this PR.` });
    } catch { /* Inspect the durable marker after any uncertain create response. */ }
    const number = await inspect(); if (!number) throw new SetupBatchProviderError('unknown');
    return number;
  }
  private sharedRevision(organization: string, resource: SetupBatchTargetPlan['sharedSnapshot'][number]): string {
    const own = this.ownAccessRevisions.get(`${organization}/${resource.kind}/${resource.name}`);
    return own?.before === resource.updatedAt ? own.after : resource.updatedAt;
  }
  private async branchSha(plan: SetupBatchTargetPlan, branch: string, token: string): Promise<string | undefined> {
    try {
      const value = batchObject(await this.read.transport.call(token, 'GET /repos/{owner}/{repo}/git/ref/{ref}',
        { owner: plan.target.owner, repo: plan.target.name, ref: `heads/${branch}` }));
      const sha = batchObject(value?.object)?.sha;
      if (!batchSha(sha)) throw new SetupBatchProviderError('malformed');
      return sha;
    } catch (error) { if (error instanceof SetupBatchProviderError && error.code === 'not-found') return undefined; throw error; }
  }
  private async assertPrepared(plan: SetupBatchTargetPlan, operationId: string, commit: string, token: string): Promise<void> {
    if (!batchSha(commit)) throw new SetupBatchProviderError('malformed');
    const parameters = { owner: plan.target.owner, repo: plan.target.name };
    const response = batchObject(await this.read.transport.call(token, 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}', { ...parameters, commit_sha: commit }));
    if (!Array.isArray(response?.parents) || response.parents.length !== 1 || batchObject(response.parents[0])?.sha !== plan.target.baseSha) throw new SetupBatchProviderError('unknown');
    const content = batchObject(await this.read.transport.call(token, 'GET /repos/{owner}/{repo}/contents/{path}',
      { ...parameters, path: '.copilot/setup-manifest.json', ref: commit }));
    if (content?.encoding !== 'base64' || typeof content.content !== 'string' || content.content.length > 140_000) throw new SetupBatchProviderError('malformed');
    const manifest = batchObject(JSON.parse(Buffer.from(content.content, 'base64').toString('utf8')));
    const receipt = manifest?.installation;
    if (!isSetupBatchInstallationReceipt(receipt) || receipt.operationId !== operationId || receipt.repositoryId !== plan.target.id
      || receipt.baseSha !== plan.target.baseSha || receipt.planDigest !== plan.digest) throw new SetupBatchProviderError('unknown');
  }
}
