import { createHash } from 'node:crypto';
import type { SetupInstallationApprovedBlob, SetupInstallationDeliveryPlan, SetupInstallationSubtree,
  SetupInstallationTree, SetupInstallationTreeEntry } from '../application/contracts/setup_installation_delivery';
import type { SetupInstallationObjectObserver } from '../application/ports/setup_installation_delivery_ports';
import { SetupInstallationDeliveryCancelled, SetupInstallationSnapshotChanged } from '../application/ports/setup_installation_delivery_ports';
import { isSetupBatchInstallationReceipt, setupBatchBranch, setupBatchMarker,
  validSetupBatchAssetPath, validateSetupBatchTargets } from '../application/policies/setup_batch_policy';
import { SETUP_INSTALLATION_MANIFEST_PATH } from '../application/policies/setup_installation_receipt_policy';
import { assertSetupInstallationApprovedBlobs, setupInstallationTreeLevel } from '../application/policies/setup_installation_tree_policy';
import { batchObject, batchPositive, batchSha, SetupBatchProviderError, type SetupBatchGithubTransport } from './setup_batch_github_read_adapter';

/** Shared Git delivery. This object has no resource writers or general Setup configuration. */
export class SetupInstallationGithubDeliveryAdapter {
  readonly #token: string;
  private readonly plan: SetupInstallationDeliveryPlan;
  private readonly approved: readonly SetupInstallationApprovedBlob[];
  constructor(private readonly transport: Pick<SetupBatchGithubTransport, 'call'>, plan: SetupInstallationDeliveryPlan,
    token: string, private readonly revalidate: () => Promise<boolean>, private readonly active = () => true) {
    this.#token = token;
    this.plan = Object.freeze({ ...plan, target: Object.freeze({ ...plan.target }),
      files: Object.freeze(plan.files.map(file => Object.freeze({ ...file }))) });
    this.approved = this.validatePlan();
  }
  async prepareCommit(observe?: SetupInstallationObjectObserver, preparedTree?: string): Promise<string> {
    if (preparedTree !== undefined && !batchSha(preparedTree)) throw new SetupBatchProviderError('malformed');
    let pending: 'tree' | 'commit' | undefined = preparedTree === undefined ? 'tree' : 'commit';
    let posted = false, notifying = false;
    const record: SetupInstallationObjectObserver = async event => {
      notifying = true;
      await observe?.(event);
      notifying = false;
    };
    try {
      await this.fresh();
      const baseTree = await this.commitTree(this.plan.target.baseSha);
      let treeSha = preparedTree;
      if (treeSha === undefined) {
        await record({ effect: 'tree', state: 'starting' });
        await this.fresh();
        const tree = batchObject(await this.post('POST /repos/{owner}/{repo}/git/trees', { base_tree: baseTree,
          tree: this.plan.files.map(file => ({ path: file.path, type: 'blob', mode: '100644',
            ...(file.content === null ? { sha: null } : { content: file.content }) })) }, () => { posted = true; }));
        if (!batchSha(tree?.sha)) throw new SetupBatchProviderError('malformed');
        treeSha = tree.sha;
        await record({ effect: 'tree', state: 'completed', sha: treeSha });
        pending = 'commit'; posted = false;
      }
      // Retained identities still require the complete approved difference.
      await this.assertTrees(baseTree, treeSha);
      await record({ effect: 'commit', state: 'starting' });
      await this.fresh();
      const commit = batchObject(await this.post('POST /repos/{owner}/{repo}/git/commits', { tree: treeSha,
        parents: [this.plan.target.baseSha], message: `chore: configure Copilot (setup ${this.plan.operationId})` }, () => { posted = true; }));
      if (!batchSha(commit?.sha)) throw new SetupBatchProviderError('malformed');
      await record({ effect: 'commit', state: 'completed', sha: commit.sha });
      pending = undefined; posted = false;
      await this.assertPrepared(commit.sha);
      return commit.sha;
    } catch (error) {
      // Only an observed stop before POST clears an intent. A lost POST result
      // or failed journal callback retains uncertainty and is never replayed.
      if (pending !== undefined && !posted && !notifying) await record({ effect: pending, state: 'not-started' });
      throw error;
    }
  }
  async branch(commit: string, inspectOnly = false): Promise<void> {
    const ref = setupBatchBranch(this.plan.operationId);
    await this.assertPrepared(commit);
    const current = await this.branchSha();
    if (current) {
      if (current !== commit) throw new SetupBatchProviderError('unknown');
      await this.fresh(); return;
    }
    if (inspectOnly) throw new SetupBatchProviderError('unknown');
    await this.fresh();
    try { await this.post('POST /repos/{owner}/{repo}/git/refs', { ref: `refs/heads/${ref}`, sha: commit }); }
    catch (error) {
      if (error instanceof SetupInstallationDeliveryCancelled) throw error;
      /* Read the exact owned ref after an uncertain response; never repeat POST. */
    }
    if (await this.branchSha() !== commit) throw new SetupBatchProviderError('unknown');
    await this.fresh();
  }
  async pullRequest(commit: string, inspectOnly = false): Promise<number> {
    if (await this.branchSha() !== commit) throw new SetupBatchProviderError('unknown');
    await this.assertPrepared(commit);
    let number = await this.inspectPullRequest(commit);
    if (!number) {
      if (inspectOnly) throw new SetupBatchProviderError('unknown');
      await this.fresh();
      try {
        await this.post('POST /repos/{owner}/{repo}/pulls', { head: setupBatchBranch(this.plan.operationId),
          base: this.plan.target.defaultBranch, title: this.plan.title, body: this.plan.body });
      } catch (error) {
        if (error instanceof SetupInstallationDeliveryCancelled) throw error;
        /* Inspect the exact marker/head/base after any uncertain response. */
      }
      number = await this.inspectPullRequest(commit);
    }
    if (!number || await this.branchSha() !== commit) throw new SetupBatchProviderError('unknown');
    await this.fresh();
    return number;
  }
  async assertPrepared(commit: string): Promise<void> {
    if (!batchSha(commit)) throw new SetupBatchProviderError('malformed');
    const observed = batchObject(await this.call('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', { commit_sha: commit }));
    const tree = batchObject(observed?.tree)?.sha;
    if (observed?.sha !== commit || !Array.isArray(observed.parents) || observed.parents.length !== 1
      || batchObject(observed.parents[0])?.sha !== this.plan.target.baseSha || !batchSha(tree)) throw new SetupBatchProviderError('unknown');
    await this.assertTrees(await this.commitTree(this.plan.target.baseSha), tree);
    const content = batchObject(await this.call('GET /repos/{owner}/{repo}/contents/{path}', { path: SETUP_INSTALLATION_MANIFEST_PATH, ref: commit }));
    if (content?.encoding !== 'base64' || typeof content.content !== 'string' || content.content.length > 140_000) throw new SetupBatchProviderError('malformed');
    let manifest: unknown;
    try { manifest = JSON.parse(Buffer.from(content.content, 'base64').toString('utf8')); }
    catch { throw new SetupBatchProviderError('malformed'); }
    this.assertReceipt(batchObject(manifest)?.installation);
  }
  private validatePlan(): readonly SetupInstallationApprovedBlob[] {
    if (validateSetupBatchTargets(this.plan.target.owner, [this.plan.target]).length) throw new SetupBatchProviderError('malformed');
    const files = this.plan.files;
    if (files.length > 300 || files.some(file => !validSetupBatchAssetPath(file.path) || file.content !== null && typeof file.content !== 'string')
      || files.reduce((bytes, file) => bytes + Buffer.byteLength(file.content ?? ''), 0) > 2_000_000
      || files.some(file => file.content !== null && (file.path === SETUP_INSTALLATION_MANIFEST_PATH
        ? Buffer.byteLength(file.content, 'utf8') > 105_000 : Buffer.byteLength(file.content, 'utf8') > 100_000))) throw new SetupBatchProviderError('malformed');
    const approved = files.map(file => ({ path: file.path, mode: '100644' as const,
      sha: file.content === null ? null : createHash('sha1').update(`blob ${Buffer.byteLength(file.content)}\0`).update(file.content).digest('hex') }));
    assertSetupInstallationApprovedBlobs(approved);
    const content = files.find(file => file.path === SETUP_INSTALLATION_MANIFEST_PATH)?.content;
    let manifest: unknown;
    try { manifest = JSON.parse(content ?? 'null'); } catch { throw new SetupBatchProviderError('malformed'); }
    this.assertReceipt(batchObject(manifest)?.installation);
    return approved;
  }
  private assertReceipt(value: unknown): void {
    if (!isSetupBatchInstallationReceipt(value) || value.operationId !== this.plan.operationId
      || value.repositoryId !== this.plan.target.id || value.baseSha !== this.plan.target.baseSha
      || value.planDigest !== this.plan.digest) throw new SetupBatchProviderError('unknown');
  }
  private async fresh(): Promise<void> { if (!await this.revalidate()) throw new SetupInstallationSnapshotChanged(); }
  private post(route: string, parameters: Record<string, unknown>, dispatched?: () => void): Promise<unknown> {
    // No await separates current-session admission from the actual transport call.
    // Mark object intent as dispatched only after this final cancellation check.
    if (!this.active()) throw new SetupInstallationDeliveryCancelled();
    dispatched?.();
    return this.call(route, parameters);
  }
  private call(route: string, parameters: Record<string, unknown>): Promise<unknown> {
    return this.transport.call(this.#token, route, { owner: this.plan.target.owner, repo: this.plan.target.name, ...parameters });
  }
  private async commitTree(commit: string): Promise<string> {
    const value = batchObject(await this.call('GET /repos/{owner}/{repo}/git/commits/{commit_sha}', { commit_sha: commit }));
    const tree = batchObject(value?.tree)?.sha;
    if (value?.sha !== commit || !batchSha(tree)) throw new SetupBatchProviderError('malformed');
    return tree;
  }
  private async branchSha(): Promise<string | undefined> {
    try {
      const response = batchObject(await this.call('GET /repos/{owner}/{repo}/git/ref/{ref}', { ref: `heads/${setupBatchBranch(this.plan.operationId)}` }));
      const value = batchObject(response?.object)?.sha;
      if (!batchSha(value)) throw new SetupBatchProviderError('malformed');
      return value;
    } catch (error) { if (error instanceof SetupBatchProviderError && error.code === 'not-found') return undefined; throw error; }
  }
  private async inspectPullRequest(commit: string): Promise<number | undefined> {
    let match: number | undefined;
    const branch = setupBatchBranch(this.plan.operationId);
    for (let page = 1; page <= 10; page += 1) {
      // The fixed-head POST can only create this operation's owned branch PR.
      // Keep all states and omit base so human base drift remains observable.
      const response = await this.call('GET /repos/{owner}/{repo}/pulls', {
        state: 'all', head: `${this.plan.target.owner}:${branch}`, per_page: 100, page,
      });
      if (!Array.isArray(response) || response.length > 100) throw new SetupBatchProviderError('malformed');
      for (const value of response) {
        const pull = batchObject(value), head = batchObject(pull?.head), base = batchObject(pull?.base);
        const claimsOperation = typeof pull?.body === 'string' && pull.body.includes(setupBatchMarker(this.plan.operationId, this.plan.target.id));
        if (head?.ref !== branch && !claimsOperation) continue;
        if (pull?.state !== 'open' || head?.ref !== branch || head.sha !== commit || batchObject(head.repo)?.id !== this.plan.target.id
          || base?.ref !== this.plan.target.defaultBranch || batchObject(base.repo)?.id !== this.plan.target.id || typeof pull?.body !== 'string'
          || !pull.body.includes(setupBatchMarker(this.plan.operationId, this.plan.target.id)) || !batchPositive(pull.number)
          || match !== undefined) throw new SetupBatchProviderError('unknown');
        match = pull.number;
      }
      if (response.length < 100) return match;
    }
    throw new SetupBatchProviderError('malformed');
  }
  /** GitHub recommends complete non-recursive reads when recursive trees truncate. */
  private async assertTrees(baseSha: string, preparedSha: string): Promise<void> {
    const cache = new Map<string, SetupInstallationTree>();
    const read = async (sha?: string): Promise<SetupInstallationTree> => {
      if (!sha) return { entries: [], truncated: false };
      const cached = cache.get(sha); if (cached) return cached;
      const response = batchObject(await this.call('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', { tree_sha: sha }));
      if (response?.sha !== sha || response.truncated !== false || !Array.isArray(response.tree) || response.tree.length > 100_000) throw new SetupBatchProviderError('malformed');
      const entries = response.tree.map(value => {
        const row = batchObject(value);
        if (!row || typeof row.path !== 'string' || typeof row.mode !== 'string' || !batchSha(row.sha)
          || !['blob', 'tree', 'commit'].includes(String(row.type))) throw new SetupBatchProviderError('malformed');
        return { path: row.path, mode: row.mode, sha: row.sha, type: row.type as SetupInstallationTreeEntry['type'] };
      });
      const result = { entries, truncated: false }; cache.set(sha, result); return result;
    };
    const pending: SetupInstallationSubtree[] = [{ path: '', baseSha, preparedSha }];
    while (pending.length) {
      const current = pending.shift()!;
      pending.push(...setupInstallationTreeLevel(current.path, await read(current.baseSha), await read(current.preparedSha), this.approved));
    }
  }
}
