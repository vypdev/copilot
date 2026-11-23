import type { SetupBatchApplyPort } from '../application/ports/setup_batch_ports';
import type { SetupBatchGrant, SetupBatchTargetPlan, SetupBatchTargetReceipt } from '../domain/setup_batch';
import type { SetupRepositoryVariablesCommandPort } from '../application/ports/setup_wizard_ports';
import { isSetupBatchInstallationReceipt, setupBatchMarker } from '../application/policies/setup_batch_policy';
import { batchObject, SetupBatchGithubReadAdapter, SetupBatchProviderError } from './setup_batch_github_read_adapter';
import { createHash } from 'node:crypto';
import { SETUP_RUNNER_REGISTRY } from '../domain/setup_runner';
import { setupRunnerProfileIsFresh } from '../application/policies/setup_runner_policy';
import { setupRunnerInstallationSummary } from '../application/policies/setup_runner_installation_summary_policy';
import { setupInstallationFiles } from '../application/policies/setup_installation_receipt_policy';
import type { SetupInstallationDeliveryPlan } from '../application/contracts/setup_installation_delivery';
import type { SetupInstallationObjectObserver } from '../application/ports/setup_installation_delivery_ports';
import { SetupInstallationGithubDeliveryAdapter } from './setup_installation_github_delivery_adapter';

/** Reused shared resources have an additive access command only. No shared value or Secret writer is injected. */
export class SetupBatchGithubApplyAdapter implements SetupBatchApplyPort {
  // Same-process grants can advance a reviewed timestamp. Cross-process resume
  // never restores this cache: the session reconstructs and reviews a fresh plan
  // with current shared metadata before any audit or Apply (including access).
  private readonly deliveryPlans = new WeakMap<SetupBatchTargetPlan, Map<string, SetupInstallationDeliveryPlan>>();
  private readonly ownAccessRevisions = new Map<string, { readonly before: string; readonly after: string }>();
  constructor(private readonly read: SetupBatchGithubReadAdapter, private readonly variableWriter: Pick<SetupRepositoryVariablesCommandPort, 'createMissing'>,
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
    if (plan.configuration.runners?.mode === 'organization-profile') {
      if (!setupRunnerProfileIsFresh(plan.configuration.runners, effective)) return false;
      const registry = shared.filter(resource => resource.kind === 'variable' && resource.name === SETUP_RUNNER_REGISTRY);
      const profileFacts = { ...effective, organizationVariables: registry.map(resource => ({ name: resource.name, value: resource.value ?? '' })) };
      if (!setupRunnerProfileIsFresh(plan.configuration.runners, profileFacts)) return false;
    }
    for (const resource of plan.sharedSnapshot) {
      const pendingGrant = !completed.includes('access') && plan.grants.some(grant => grant.kind === resource.kind && grant.name === resource.name);
      if (!pendingGrant && (resource.kind === 'secret' ? !effective.organizationSecrets.includes(resource.name)
        : !effective.organizationVariables.some(variable => variable.name === resource.name && variable.value === resource.value))) return false;
    }
    const revisions = (remote: SetupBatchTargetPlan['remote']) => {
      const entries = remote.repositorySecretRevisions ?? [];
      if (JSON.stringify(entries.map(secret => secret.name).sort()) !== JSON.stringify([...remote.repositorySecrets].sort())
        || entries.some(secret => !Number.isFinite(Date.parse(secret.updatedAt)))) return undefined;
      return entries.map(secret => JSON.stringify([secret.name, secret.updatedAt])).sort();
    };
    const currentRevisions = revisions(effective); const reviewedRevisions = revisions(plan.remote);
    if (!currentRevisions || !reviewedRevisions || JSON.stringify(currentRevisions) !== JSON.stringify(reviewedRevisions)) return false;
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
      if (current || original || !this.variableWriter.createMissing) throw new SetupBatchProviderError('unknown');
      const result = await this.variableWriter.createMissing(plan.target.owner, plan.target.name, token, [variable]);
      if (result.errors.length > 0) throw new SetupBatchProviderError('unknown');
    }
  }
  labels(plan: SetupBatchTargetPlan, token: string) { return this.resources.labels(plan, token); }
  issueTypes(plan: SetupBatchTargetPlan, token: string) { return this.resources.issueTypes(plan, token); }
  async prepareCommit(plan: SetupBatchTargetPlan, operationId: string, token: string, observe?: SetupInstallationObjectObserver, active = () => true): Promise<string> {
    let delivery: SetupInstallationGithubDeliveryAdapter;
    try {
      if (!await this.revalidate(plan, token, [])) throw new SetupBatchProviderError('unknown');
      delivery = await this.fileDelivery(plan, operationId, token, active);
    } catch (error) {
      // These reads precede delegation, so neither Git-object POST can have started.
      await observe?.({ effect: 'tree', state: 'not-started' });
      throw error;
    }
    return delivery.prepareCommit(observe);
  }
  async branch(plan: SetupBatchTargetPlan, operationId: string, commit: string, token: string, inspectOnly = false, active = () => true): Promise<void> {
    return (await this.fileDelivery(plan, operationId, token, active)).branch(commit, inspectOnly);
  }
  async pullRequest(plan: SetupBatchTargetPlan, operationId: string, commit: string, token: string, inspectOnly = false, active = () => true): Promise<number> {
    return (await this.fileDelivery(plan, operationId, token, active)).pullRequest(commit, inspectOnly);
  }
  private async fileDelivery(plan: SetupBatchTargetPlan, operationId: string, token: string, active: () => boolean): Promise<SetupInstallationGithubDeliveryAdapter> {
    const installation = { schemaVersion: 1, operationId, repositoryId: plan.target.id, baseSha: plan.target.baseSha, planDigest: plan.digest };
    if (!isSetupBatchInstallationReceipt(installation)) throw new SetupBatchProviderError('malformed');
    let byOperation = this.deliveryPlans.get(plan);
    if (!byOperation) { byOperation = new Map(); this.deliveryPlans.set(plan, byOperation); }
    let snapshot = byOperation.get(operationId);
    if (!snapshot) {
      const manifestPath = '.copilot/setup-manifest.json';
      let manifest = plan.files.find(file => file.path === manifestPath)?.content;
      if (!manifest) manifest = (await this.read.files(plan.target, token)).find(file => file.path === manifestPath)?.content;
      let parsed: Record<string, unknown> | undefined;
      try { parsed = manifest ? batchObject(JSON.parse(manifest)) : { schemaVersion: 2,
        generator: { name: '@vypdev/copilot', contractVersion: 1 }, artifacts: {}, profileDigest: createHash('sha256').update('').digest('hex') }; }
      catch { throw new SetupBatchProviderError('malformed'); }
      if (!parsed) throw new SetupBatchProviderError('malformed');
      snapshot = { target: plan.target, operationId, digest: plan.digest,
        files: setupInstallationFiles(plan.files, parsed, installation), title: 'chore: configure Copilot',
        body: `${setupBatchMarker(operationId, plan.target.id)}\n\nConfigure Copilot using the reviewed setup plan. Shared Secret values are retained.\n\n**Status:** PR created; installation awaits human review and merge. Runtime credential and capability verification remain pending.\n\nReview the generated workflows, repository guidance and configuration before merging. Setup never merges, releases or deploys this PR.${setupRunnerInstallationSummary(plan)}` };
      byOperation.set(operationId, snapshot);
    }
    return new SetupInstallationGithubDeliveryAdapter(this.read.transport, snapshot, token,
      () => this.revalidate(plan, token, ['access', 'variables', 'labels', 'issue-types']), active);
  }
  private sharedRevision(organization: string, resource: SetupBatchTargetPlan['sharedSnapshot'][number]): string {
    const own = this.ownAccessRevisions.get(`${organization}/${resource.kind}/${resource.name}`);
    return own?.before === resource.updatedAt ? own.after : resource.updatedAt;
  }
}
