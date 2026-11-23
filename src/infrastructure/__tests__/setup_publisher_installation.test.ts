import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import type { SetupPublisherOperation } from '../../domain/setup_publisher_installation';
import type { SetupBatchOperation } from '../../domain/setup_batch';
import { SetupPublisherJournalAdapter } from '../setup_publisher_journal_adapter';
import { SetupBatchJournalAdapter } from '../setup_batch_journal_adapter';
import { SetupOperationJournalStore } from '../setup_operation_journal_store';
import { SetupInstallationGithubDeliveryAdapter } from '../setup_installation_github_delivery_adapter';
import { setupInstallationTreeFixture } from './fixtures/setup_installation_tree_fixture';
import { setupBatchBranch, setupBatchMarker } from '../../application/policies/setup_batch_policy';
import { SetupBatchProviderError } from '../setup_batch_github_read_adapter';
import { SetupInstallationSnapshotChanged } from '../../application/ports/setup_installation_delivery_ports';
import type { SetupInstallationDeliveryPlan } from '../../application/contracts/setup_installation_delivery';
import { SETUP_PUBLISHER_WORKFLOW_PATH } from '../../domain/setup_publisher_installation';
import { parseSetupPublisherOperation } from '../../application/policies/setup_publisher_installation_policy';

const operation: SetupPublisherOperation = { schemaVersion: 2, purpose: 'bugbot-status-publisher',
  operationId: '12345678-1234-4234-8234-123456789abc', repositoryId: 42, repository: 'vypdev/copilot',
  defaultBranch: 'master', baseSha: 'a'.repeat(40), sourceCommit: 'b'.repeat(40), planDigest: 'c'.repeat(64),
  approvalDigest: 'd'.repeat(64), actorId: 7, status: 'ready', effects: [] };
const legacy: SetupBatchOperation = { schemaVersion: 1, operationId: operation.operationId, organization: 'vypdev', targets: [
  { repositoryId: 42, repository: 'copilot', defaultBranch: 'master', baseSha: 'a'.repeat(40), planDigest: 'c'.repeat(64), status: 'ready', effects: [] },
] };

describe('shared store with separate publisher and legacy schemas', () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'copilot-publisher-store-')); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  it('publisher977-C109: links only an existing exact publisher record without creating preview state', async () => {
    const journal = new SetupPublisherJournalAdapter(root);
    const navigation = journal as unknown as { recordLocation?: (id: string) => Promise<string | undefined> };
    expect(await navigation.recordLocation?.(operation.operationId)).toBeUndefined();
    expect(await readdir(root)).toEqual([]);
    await journal.save(operation);
    const file = join(root, `${operation.operationId}.json`), before = await readFile(file);
    expect(await navigation.recordLocation?.(operation.operationId)).toBe(pathToFileURL(file).href);
    expect(await readFile(file)).toEqual(before);
  });
  it('publisher977-C109: missing roots and mismatched saved IDs remain read-only and unlinked', async () => {
    const absent = join(root, 'not-created'), missing = new SetupPublisherJournalAdapter(absent);
    expect(await missing.recordLocation(operation.operationId)).toBeUndefined();
    expect(await readdir(root)).toEqual([]);
    const file = join(root, `${operation.operationId}.json`);
    const content = JSON.stringify({ ...operation, operationId: '22222222-2222-4222-8222-222222222222' });
    await writeFile(file, content);
    expect(await new SetupPublisherJournalAdapter(root).recordLocation(operation.operationId)).toBeUndefined();
    expect(await readFile(file, 'utf8')).toBe(content);
  });
  it('publisher977-C109: a legacy or malformed record cannot become a publisher navigation target', async () => {
    const batch = new SetupBatchJournalAdapter(root); await batch.save(legacy);
    const publisher = new SetupPublisherJournalAdapter(root);
    const navigation = publisher as unknown as { recordLocation?: (id: string) => Promise<string | undefined> };
    const file = join(root, `${operation.operationId}.json`), before = await readFile(file);
    expect(await navigation.recordLocation?.(operation.operationId)).toBeUndefined();
    expect(await navigation.recordLocation?.('../escape')).toBeUndefined();
    expect(await readFile(file)).toEqual(before);
  });
  it('stores only the closed publisher metadata and reloads it', async () => {
    const journal = new SetupPublisherJournalAdapter(root);
    expect(await journal.load(operation.operationId)).toBeUndefined();
    await journal.save(operation);
    expect(await journal.load(operation.operationId)).toEqual(operation);
    expect(JSON.parse(await readFile(join(root, `${operation.operationId}.json`), 'utf8'))).toEqual(operation);
    await expect(journal.save({ ...operation, token: 'never-store' } as SetupPublisherOperation)).rejects.toThrow();
    expect(await journal.load(operation.operationId)).toEqual(operation);
  });
  it('publisher resume cannot parse, migrate or overwrite a legacy journal', async () => {
    const batch = new SetupBatchJournalAdapter(root); await batch.save(legacy);
    const publisher = new SetupPublisherJournalAdapter(root);
    await expect(publisher.load(operation.operationId)).rejects.toThrow();
    await expect(publisher.save(operation)).rejects.toThrow();
    expect(await batch.load(operation.operationId)).toEqual(legacy);
  });
  it('bare legacy resume cannot interpret a publisher journal as a batch operation', async () => {
    const publisher = new SetupPublisherJournalAdapter(root); await publisher.save(operation);
    const batch = new SetupBatchJournalAdapter(root);
    await expect(batch.load(operation.operationId)).rejects.toThrow();
    await expect(batch.save(legacy)).rejects.toThrow();
    expect(await publisher.load(operation.operationId)).toEqual(operation);
  });
  it('both purposes use one exclusive UUID lock and never reclaim its current owner', async () => {
    const publisher = new SetupPublisherJournalAdapter(root), batch = new SetupBatchJournalAdapter(root);
    const release = await publisher.lock(operation.operationId);
    await expect(batch.lock(operation.operationId)).rejects.toMatchObject({ code: 'EEXIST' });
    await release(); const releaseBatch = await batch.lock(operation.operationId);
    await expect(publisher.lock(operation.operationId)).rejects.toMatchObject({ code: 'EEXIST' });
    await releaseBatch(); expect(await readdir(root)).toEqual([]);
  });
  it.each([['missing value', undefined], ['oversized metadata', { oversized: 'x'.repeat(40_000) }]])('rejects invalid serialized size before creating files: %s', async (_reason, value) => {
    await expect(new SetupOperationJournalStore(parseSetupPublisherOperation, root).save(operation.operationId, value)).rejects.toThrow('journal size');
    expect(await readdir(root)).toEqual([]);
  });
});

function deliveryFixture(publisherInstalled = false) {
  const base = 'a'.repeat(40), commit = 'c'.repeat(40), id = operation.operationId;
  const manifestPath = '.copilot/setup-manifest.json';
  const receipt = { schemaVersion: 1, operationId: id, repositoryId: 42, baseSha: base, planDigest: 'd'.repeat(64) };
  const baseline = JSON.stringify({ schemaVersion: 2, generator: { name: '@vypdev/copilot', contractVersion: 1 }, artifacts: { retained: true } });
  const finalManifest = JSON.stringify({ ...JSON.parse(baseline), installation: receipt }, null, 2) + '\n';
  const baseFiles = new Map([['README.md', 'human source'], ['.github/workflows/human.yml', 'human workflow'], [manifestPath, baseline]]);
  const files = [{ path: SETUP_PUBLISHER_WORKFLOW_PATH, content: 'name: Reviewed publisher\n' }, { path: manifestPath, content: finalManifest }];
  if (publisherInstalled) baseFiles.set(SETUP_PUBLISHER_WORKFLOW_PATH, files[0].content);
  const preparedFiles = new Map([...baseFiles, ...files.map(file => [file.path, file.content] as const)]);
  const baseTree = setupInstallationTreeFixture(baseFiles);
  let branch: string | undefined, pulls: unknown[] = [];
  let transform = (_route: string, data: unknown, _parameters: Record<string, unknown>): unknown => data;
  const plan: SetupInstallationDeliveryPlan = { target: { id: 42, ownerId: 7, owner: 'vypdev', name: 'copilot', defaultBranch: 'master', baseSha: base,
    private: true, archived: false, disabled: false, canPush: true }, operationId: id, digest: receipt.planDigest, files,
  title: 'chore: install reviewed publisher', body: setupBatchMarker(id, 42) + '\nInstallation awaits merge and native verification.' };
  const pull = () => ({ number: 73, state: 'open', body: plan.body,
    head: { ref: setupBatchBranch(id), sha: commit, repo: { id: 42 } }, base: { ref: 'master', repo: { id: 42 } } });
  const transport = { call: jest.fn(async (_token: string, route: string, parameters: Record<string, unknown>): Promise<unknown> => {
    let data: unknown;
    if (route === 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}') data = parameters.commit_sha === base
      ? { sha: base, tree: { sha: baseTree.root } } : { sha: commit, parents: [{ sha: base }], tree: { sha: setupInstallationTreeFixture(preparedFiles).root } };
    else if (route === 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}') data = baseTree.trees.get(String(parameters.tree_sha))
      ?? setupInstallationTreeFixture(preparedFiles).trees.get(String(parameters.tree_sha));
    else if (route === 'GET /repos/{owner}/{repo}/contents/{path}' && parameters.path === manifestPath) data = { encoding: 'base64', content: Buffer.from(preparedFiles.get(manifestPath)!).toString('base64') };
    else if (route === 'POST /repos/{owner}/{repo}/git/trees') {
      for (const file of parameters.tree as { path: string; content: string }[]) preparedFiles.set(file.path, file.content);
      data = { sha: setupInstallationTreeFixture(preparedFiles).root };
    } else if (route === 'POST /repos/{owner}/{repo}/git/commits') data = { sha: commit };
    else if (route === 'GET /repos/{owner}/{repo}/git/ref/{ref}') {
      if (!branch) throw new SetupBatchProviderError('not-found'); data = { object: { sha: branch } };
    } else if (route === 'POST /repos/{owner}/{repo}/git/refs') { branch = String(parameters.sha); data = {}; }
    else if (route === 'GET /repos/{owner}/{repo}/pulls') data = pulls;
    else if (route === 'POST /repos/{owner}/{repo}/pulls') { const created = pull(); pulls = [...pulls, created]; data = created; }
    else throw new Error('Unexpected fixed file-delivery route');
    return transform(route, data, parameters);
  }) };
  const fresh = jest.fn(async () => true);
  const writer = new SetupInstallationGithubDeliveryAdapter(transport, plan, 'private-fixture-token', fresh);
  const posts = () => transport.call.mock.calls.filter(([, route]) => route.startsWith('POST '));
  return { base, commit, plan, writer, transport, fresh, baseTree, preparedFiles, pull, posts,
    transform: (next: typeof transform) => { transform = next; }, setBranch: (value: string) => { branch = value; },
    setPulls: (value: unknown[]) => { pulls = value; } };
}

describe('actual shared Git delivery composition with controlled provider', () => {
  const otherOperation = '11111111-1111-4111-8111-111111111111';
  it.each(['open', 'closed'])('ignores an unrelated %s setup PR when creating this operation PR', async state => {
    const f = deliveryFixture(); f.setBranch(f.commit);
    const unrelated = { ...f.pull(), number: 91, state, body: setupBatchMarker(otherOperation, 42),
      head: { ...f.pull().head, ref: setupBatchBranch(otherOperation) } };
    f.setPulls([unrelated]);
    await expect(f.writer.pullRequest(f.commit)).resolves.toBe(73);
    expect(f.posts().map(([, route]) => route)).toEqual(['POST /repos/{owner}/{repo}/pulls']);
    expect(f.posts()[0][2]).toMatchObject({ head: setupBatchBranch(operation.operationId), body: f.plan.body });
  });
  it.each(['before', 'after'])('inspects only this operation with an unrelated open setup PR %s it', async position => {
    const f = deliveryFixture(); f.setBranch(f.commit);
    const unrelated = { ...f.pull(), number: 91, body: setupBatchMarker(otherOperation, 42),
      head: { ...f.pull().head, ref: setupBatchBranch(otherOperation) } };
    f.setPulls(position === 'before' ? [unrelated, f.pull()] : [f.pull(), unrelated]);
    await expect(f.writer.pullRequest(f.commit, true)).resolves.toBe(73);
    expect(f.posts()).toEqual([]);
  });
  it.each(['different setup ref', 'human ref', 'missing head'])('rejects this operation marker on a %s without creating a PR', async kind => {
    const f = deliveryFixture(); f.setBranch(f.commit);
    f.setPulls([{ ...f.pull(), head: kind === 'missing head' ? undefined
      : { ...f.pull().head, ref: kind === 'human ref' ? 'human/work' : setupBatchBranch(otherOperation) } }]);
    await expect(f.writer.pullRequest(f.commit)).rejects.toThrow('unknown');
    expect(f.posts()).toEqual([]);
  });
  it.each(['exact', 'missing', 'duplicate', 'foreign', 'unterminated'] as const)(
    'publisher977-C44: complete PR pagination handles %s evidence without creating a duplicate', async outcome => {
      const f = deliveryFixture(); f.setBranch(f.commit);
      const ordinary = Array.from({ length: 100 }, (_, number) => ({ number: number + 100, state: 'closed', head: { ref: 'human/history' } }));
      const exact = f.pull();
      f.transform((route, data, parameters) => {
        if (route !== 'GET /repos/{owner}/{repo}/pulls') return data;
        const page = Number(parameters.page);
        if (outcome === 'unterminated') return ordinary;
        if (page === 1) return outcome === 'duplicate' ? [exact, ...ordinary.slice(1)] : ordinary;
        return outcome === 'missing' ? [] : outcome === 'foreign'
          ? [{ ...exact, head: { ...exact.head, ref: 'setup/copilot/11111111-1111-4111-8111-111111111111' } }] : [exact];
      });
      if (outcome === 'exact') await expect(f.writer.pullRequest(f.commit, true)).resolves.toBe(exact.number);
      else await expect(f.writer.pullRequest(f.commit, true)).rejects.toBeDefined();
      const pages = f.transport.call.mock.calls.filter(([, route]) => route === 'GET /repos/{owner}/{repo}/pulls').map(([, , p]) => p.page);
      expect(pages).toEqual(outcome === 'unterminated' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2]);
      expect(f.transport.call.mock.calls.filter(([, route]) => route === 'GET /repos/{owner}/{repo}/pulls')
        .every(([, , p]) => p.head === `${f.plan.target.owner}:${setupBatchBranch(f.plan.operationId)}` && !('base' in p))).toBe(true);
      expect(f.posts()).toEqual([]);
    });

  it.each(['exact', 'duplicate', 'foreign base', 'foreign repository'] as const)(
    'publisher977-C119: scoped recovery beyond1000 unrelated PRs preserves %s identity checks', async outcome => {
      const f = deliveryFixture(); f.setBranch(f.commit);
      // Prove the real adapter's complete approved-tree/receipt preconditions,
      // independently of the pagination response under investigation.
      await expect(f.writer.assertPrepared(f.commit)).resolves.toBeUndefined();
      const exact = f.pull();
      const candidates = outcome === 'duplicate' ? [exact, { ...exact, number: 74 }]
        : outcome === 'foreign base' ? [{ ...exact, base: { ...exact.base, ref: 'human-moved-base' } }]
          : outcome === 'foreign repository' ? [{ ...exact, head: { ...exact.head, repo: { id: 43 } } }] : [exact];
      const history = [...Array.from({ length: 1000 }, (_, n) => ({ ...exact, number: n + 100,
        body: 'Unrelated human discussion.', head: { ...exact.head, ref: `human/history-${n}` } })), ...candidates];
      f.transform((route, data, parameters) => {
        if (route !== 'GET /repos/{owner}/{repo}/pulls') return data;
        // Model GitHub's documented owner:head filter. Without it, the same
        // bounded reader consumes ten full unrelated pages and cannot recover.
        const selected = typeof parameters.head === 'string'
          ? history.filter(p => `${f.plan.target.owner}:${p.head.ref}` === parameters.head) : history;
        const start = (Number(parameters.page) - 1) * 100;
        return selected.slice(start, start + 100);
      });
      if (outcome === 'exact') await expect(f.writer.pullRequest(f.commit, true)).resolves.toBe(73);
      else await expect(f.writer.pullRequest(f.commit, true)).rejects.toThrow('unknown');
      const reads = f.transport.call.mock.calls.filter(([, route]) => route === 'GET /repos/{owner}/{repo}/pulls');
      expect(reads.map(([, , p]) => p.page)).toEqual([1]);
      expect(reads[0][2]).toMatchObject({ head: `${f.plan.target.owner}:${setupBatchBranch(f.plan.operationId)}`, state: 'all', per_page: 100 });
      expect(reads[0][2]).not.toHaveProperty('base');
      expect(f.posts()).toEqual([]);
    });

  it('creates only approved file objects on the exact base and retains actual object identities', async () => {
    const f = deliveryFixture(), effects: unknown[] = [];
    expect(await f.writer.prepareCommit(async effect => { effects.push(effect); })).toBe(f.commit);
    expect(effects).toEqual([{ effect: 'tree', state: 'starting' }, { effect: 'tree', state: 'completed', sha: setupInstallationTreeFixture(f.preparedFiles).root },
      { effect: 'commit', state: 'starting' }, { effect: 'commit', state: 'completed', sha: f.commit }]);
    expect(f.posts().map(([, route]) => route)).toEqual(['POST /repos/{owner}/{repo}/git/trees', 'POST /repos/{owner}/{repo}/git/commits']);
    expect(f.posts()[0][2]).toMatchObject({ base_tree: f.baseTree.root, tree: f.plan.files.map(file => ({ ...file, mode: '100644', type: 'blob' })) });
    expect(f.posts()[1][2]).toMatchObject({ parents: [f.base] });
    expect(JSON.stringify(f.posts().map(([, , parameters]) => parameters))).not.toContain('private-fixture-token');
    expect(f.transport.call.mock.calls.filter(([, route]) => route.includes('/git/trees/')).every(([, , params]) => !('recursive' in params))).toBe(true);
  });
  it('rejects an extra prepared sibling even when workflow and receipt blobs match', async () => {
    const f = deliveryFixture(); f.preparedFiles.set('.copilot/human.json', 'unapproved');
    await expect(f.writer.branch(f.commit)).rejects.toThrow('complete approved file scope'); expect(f.posts()).toEqual([]);
  });
  it('reuses a retained exact tree after complete verification without another tree POST', async () => {
    const f = deliveryFixture(), effects: unknown[] = [];
    const tree = setupInstallationTreeFixture(f.preparedFiles).root;
    expect(await f.writer.prepareCommit(async effect => { effects.push(effect); }, tree)).toBe(f.commit);
    expect(f.posts().map(([, route]) => route)).toEqual(['POST /repos/{owner}/{repo}/git/commits']);
    expect(f.posts()[0][2]).toMatchObject({ tree, parents: [f.base] });
    expect(effects).toEqual([{ effect: 'commit', state: 'starting' }, { effect: 'commit', state: 'completed', sha: f.commit }]);
  });
  it.each(['', 'main', 'a'.repeat(39), 'g'.repeat(40)])('rejects an invalid retained tree identity %j before provider access', async tree => {
    const f = deliveryFixture(); await expect(f.writer.prepareCommit(undefined, tree)).rejects.toThrow('malformed');
    expect(f.transport.call).not.toHaveBeenCalled(); expect(f.fresh).not.toHaveBeenCalled();
  });
  it('refuses a retained tree with extra bytes before creating a commit', async () => {
    const f = deliveryFixture(); f.preparedFiles.set('README.md', 'unapproved edit');
    await expect(f.writer.prepareCommit(undefined, setupInstallationTreeFixture(f.preparedFiles).root)).rejects.toThrow('complete approved file scope');
    expect(f.posts()).toEqual([]);
  });
  it('refuses truncated retained-tree evidence without preparing replacement objects', async () => {
    const f = deliveryFixture(), tree = setupInstallationTreeFixture(f.preparedFiles).root;
    f.transform((route, data) => route.includes('/git/trees/') ? { ...(data as object), truncated: true } : data);
    await expect(f.writer.prepareCommit(undefined, tree)).rejects.toThrow('malformed'); expect(f.posts()).toEqual([]);
  });
  it('retains a denied tree read as unavailable without creating another tree or commit', async () => {
    const f = deliveryFixture(), tree = setupInstallationTreeFixture(f.preparedFiles).root;
    f.transform((route, data) => { if (route.includes('/git/trees/')) throw new SetupBatchProviderError('unknown'); return data; });
    await expect(f.writer.prepareCommit(undefined, tree)).rejects.toThrow('unknown'); expect(f.posts()).toEqual([]);
  });
  it('checks freshness again after retained-tree proof and before commit creation', async () => {
    const f = deliveryFixture(), effects: unknown[] = [], tree = setupInstallationTreeFixture(f.preparedFiles).root;
    f.fresh.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(f.writer.prepareCommit(async effect => { effects.push(effect); }, tree)).rejects.toBeInstanceOf(SetupInstallationSnapshotChanged);
    expect(effects).toEqual([{ effect: 'commit', state: 'starting' }, { effect: 'commit', state: 'not-started' }]); expect(f.posts()).toEqual([]);
  });
  it('requires the resumed commit intent to be durable before creating it', async () => {
    const f = deliveryFixture(), tree = setupInstallationTreeFixture(f.preparedFiles).root;
    await expect(f.writer.prepareCommit(async () => { throw new Error('journal failure'); }, tree)).rejects.toThrow('journal failure');
    expect(f.posts()).toEqual([]);
  });
  it('rejects an unrelated changed subtree without descending outside approved ancestors', async () => {
    const f = deliveryFixture(); f.preparedFiles.set('README.md', 'unapproved edit');
    await expect(f.writer.branch(f.commit)).rejects.toThrow('complete approved file scope'); expect(f.posts()).toEqual([]);
  });
  it.each(['wrong parent', 'multiple parents', 'missing tree'])('rejects a prepared commit with %s before adopting its ref', async kind => {
    const f = deliveryFixture(); f.setBranch(f.commit);
    f.transform((route, data, params) => route.includes('/git/commits/') && params.commit_sha === f.commit
      ? kind === 'missing tree' ? { parents: [{ sha: f.base }] } : { ...(data as object), parents: kind === 'wrong parent' ? [{ sha: 'f'.repeat(40) }] : [{ sha: f.base }, { sha: f.base }] } : data);
    await expect(f.writer.branch(f.commit)).rejects.toThrow(); expect(f.posts()).toEqual([]);
  });
  it.each(['truncated', 'foreign tree identity', 'missing inventory', 'wrong leaf mode'])('rejects %s in complete-tree evidence', async kind => {
    const f = deliveryFixture();
    f.transform((route, data) => {
      if (!route.includes('/git/trees/')) return data;
      const tree = data as { sha: string; tree: { path: string; mode: string }[] };
      return kind === 'truncated' ? { ...tree, truncated: true } : kind === 'foreign tree identity' ? { ...tree, sha: 'f'.repeat(40) }
        : kind === 'missing inventory' ? { ...tree, tree: null } : { ...tree, tree: tree.tree.map(entry => entry.path.endsWith('.yml') ? { ...entry, mode: '120000' } : entry) };
    });
    await expect(f.writer.branch(f.commit)).rejects.toThrow(); expect(f.posts()).toEqual([]);
  });
  it('does not replay an unknown tree POST and emits no invented object identity', async () => {
    const f = deliveryFixture(), effects: unknown[] = [];
    f.transform((route, data) => route === 'POST /repos/{owner}/{repo}/git/trees' ? {} : data);
    await expect(f.writer.prepareCommit(async effect => { effects.push(effect); })).rejects.toThrow();
    expect(f.posts()).toHaveLength(1); expect(effects).toEqual([{ effect: 'tree', state: 'starting' }]);
  });
  it('retains a known tree and uncertain commit outcome without another object POST', async () => {
    const f = deliveryFixture(), effects: unknown[] = [];
    f.transform((route, data) => route === 'POST /repos/{owner}/{repo}/git/commits' ? {} : data);
    await expect(f.writer.prepareCommit(async effect => { effects.push(effect); })).rejects.toThrow();
    expect(f.posts()).toHaveLength(2); expect(effects).toEqual([{ effect: 'tree', state: 'starting' },
      { effect: 'tree', state: 'completed', sha: setupInstallationTreeFixture(f.preparedFiles).root }, { effect: 'commit', state: 'starting' }]);
  });
  it('a journal failure before an object POST stops its creation', async () => {
    const f = deliveryFixture();
    await expect(f.writer.prepareCommit(async () => { throw new Error('journal failure'); })).rejects.toThrow('journal failure'); expect(f.posts()).toEqual([]);
  });
  it('verified drift before a tree write is distinct from an unavailable read and starts no POST', async () => {
    const f = deliveryFixture(); f.fresh.mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(f.writer.prepareCommit()).rejects.toBeInstanceOf(SetupInstallationSnapshotChanged); expect(f.posts()).toEqual([]);
  });
  it('verified drift after tree creation stops the commit and retains the known tree', async () => {
    const f = deliveryFixture(), effects: unknown[] = []; f.fresh.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValue(false);
    await expect(f.writer.prepareCommit(async effect => { effects.push(effect); })).rejects.toBeInstanceOf(SetupInstallationSnapshotChanged);
    expect(f.posts()).toHaveLength(1); expect(effects).toContainEqual({ effect: 'tree', state: 'completed', sha: setupInstallationTreeFixture(f.preparedFiles).root });
  });
  it('read-only recovery of an absent uncertain ref does not repeat POST', async () => {
    const f = deliveryFixture(); await expect(f.writer.branch(f.commit, true)).rejects.toThrow(); expect(f.posts()).toEqual([]);
  });
  it('read-only recovery of an absent uncertain PR does not repeat POST', async () => {
    const f = deliveryFixture(); f.setBranch(f.commit);
    await expect(f.writer.pullRequest(f.commit, true)).rejects.toThrow(); expect(f.posts()).toEqual([]);
  });
  it('ref response loss adopts only the exact prepared commit through a readback', async () => {
    const f = deliveryFixture(); f.transform((route, data) => { if (route === 'POST /repos/{owner}/{repo}/git/refs') throw new Error('lost response'); return data; });
    await f.writer.branch(f.commit); expect(f.posts()).toHaveLength(1);
  });
  it('a human-advanced ref is neither overwritten nor used for PR creation', async () => {
    const f = deliveryFixture(); f.setBranch('f'.repeat(40));
    await expect(f.writer.branch(f.commit)).rejects.toThrow(); await expect(f.writer.pullRequest(f.commit)).rejects.toThrow(); expect(f.posts()).toEqual([]);
  });
  it('PR response loss recovers one exact marker/head/base match without another POST', async () => {
    const f = deliveryFixture(); f.setBranch(f.commit);
    f.transform((route, data) => { if (route === 'POST /repos/{owner}/{repo}/pulls') throw new Error('lost response'); return data; });
    expect(await f.writer.pullRequest(f.commit)).toBe(73); expect(await f.writer.pullRequest(f.commit, true)).toBe(73); expect(f.posts()).toHaveLength(1);
  });
  it.each(['marker', 'head ref', 'head sha', 'head repository', 'base ref', 'base repository'])(
    'publisher977-C33 refuses an uncertain PR with foreign %s without another POST', async field => {
      const f = deliveryFixture(), pull = f.pull(); f.setBranch(f.commit);
      if (field === 'marker') pull.body = 'Unrelated human PR';
      if (field === 'head ref') pull.head.ref = 'setup/copilot/foreign';
      if (field === 'head sha') pull.head.sha = 'f'.repeat(40);
      if (field === 'head repository') pull.head.repo.id = 99;
      if (field === 'base ref') pull.base.ref = 'foreign';
      if (field === 'base repository') pull.base.repo.id = 99;
      f.setPulls([pull]);
      await expect(f.writer.pullRequest(f.commit)).rejects.toThrow(); expect(f.posts()).toEqual([]);
    },
  );
  it('a head changed during PR creation remains a partial conflict without cleanup', async () => {
    const f = deliveryFixture(); f.setBranch(f.commit);
    f.transform((route, data) => { if (route === 'POST /repos/{owner}/{repo}/pulls') f.setBranch('f'.repeat(40)); return data; });
    await expect(f.writer.pullRequest(f.commit)).rejects.toThrow(); expect(f.posts()).toHaveLength(1);
  });
  it('the bound approved file bytes cannot be replaced by mutating the caller plan', async () => {
    const f = deliveryFixture(); (f.plan.files as { path: string; content: string }[]).push({ path: '.github/workflows/foreign.yml', content: 'unapproved' });
    await f.writer.prepareCommit();
    expect((f.posts()[0][2].tree as { path: string }[]).map(file => file.path)).toEqual([SETUP_PUBLISHER_WORKFLOW_PATH, '.copilot/setup-manifest.json']);
  });
  it.each(['unsafe path', 'non-string content', 'too many files', 'aggregate bytes', 'oversized file', 'oversized receipt', 'invalid manifest'])('rejects invalid approved files before transport: %s', kind => {
    const f = deliveryFixture();
    const extra = kind === 'unsafe path' ? [{ path: '../unapproved', content: 'no' }]
      : kind === 'non-string content' ? [{ path: 'AGENTS.md', content: 42 as unknown as string }]
        : kind === 'too many files' ? Array.from({ length: 301 }, (_, index) => ({ path: `.github/workflows/job${index}.yml`, content: '' }))
          : kind === 'aggregate bytes' ? Array.from({ length: 21 }, (_, index) => ({ path: `.github/workflows/job${index}.yml`, content: 'x'.repeat(100_000) }))
            : [{ path: kind === 'oversized file' ? 'AGENTS.md' : '.copilot/setup-manifest.json', content: kind === 'invalid manifest' ? '{broken' : kind === 'oversized receipt'
              ? JSON.stringify({ ...JSON.parse(f.plan.files.find(file => file.path.endsWith('setup-manifest.json'))!.content!), padding: 'x'.repeat(105_001) }) : 'x'.repeat(100_001) }];
    const files = kind === 'oversized receipt' || kind === 'invalid manifest' ? [...f.plan.files.filter(file => !file.path.endsWith('setup-manifest.json')), ...extra] : [...f.plan.files, ...extra];
    expect(() => new SetupInstallationGithubDeliveryAdapter(f.transport, { ...f.plan, files }, 'private-fixture-token', f.fresh)).toThrow();
    expect(f.transport.call).not.toHaveBeenCalled();
  });
  it('rejects a target that no longer admits Setup before transport', () => {
    const f = deliveryFixture(); expect(() => new SetupInstallationGithubDeliveryAdapter(f.transport,
      { ...f.plan, target: { ...f.plan.target, canPush: false } }, 'private-fixture-token', f.fresh)).toThrow();
    expect(f.transport.call).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON in the actual prepared receipt rather than exposing it', async () => {
    const f = deliveryFixture(); f.transform((route, data) => route.includes('/contents/') ? { encoding: 'base64', content: Buffer.from('{bad private-fixture-text').toString('base64') } : data);
    await expect(f.writer.branch(f.commit)).rejects.toThrow('malformed'); expect(f.posts()).toEqual([]);
  });
  it.each([null, { path: 42 }, { path: 'file', mode: 42 }, { path: 'file', mode: '100644', sha: 'wrong' },
    { path: 'file', mode: '100644', sha: 'f'.repeat(40), type: 'unknown' }])('rejects a malformed provider tree entry %j', entry => {
    const f = deliveryFixture(); f.transform((route, data) => route.includes('/git/trees/') ? { ...(data as object), tree: [entry] } : data);
    return expect(f.writer.branch(f.commit)).rejects.toThrow('malformed');
  });
  it('rejects an over-bound tree inventory instead of treating it as complete', async () => {
    const f = deliveryFixture(); f.transform((route, data) => route.includes('/git/trees/') ? { ...(data as object), tree: Array(100_001).fill({}) } : data);
    await expect(f.writer.branch(f.commit)).rejects.toThrow('malformed'); expect(f.posts()).toEqual([]);
  });
  it('rejects a foreign commit response identity before creating refs', async () => {
    const f = deliveryFixture(); f.transform((route, data, parameters) => route.includes('/git/commits/') && parameters.commit_sha === f.commit
      ? { ...(data as object), sha: 'f'.repeat(40) } : data);
    await expect(f.writer.branch(f.commit)).rejects.toThrow(); expect(f.posts()).toEqual([]);
  });
  it('does not adopt a PR whose base repository differs from the approved target', async () => {
    const f = deliveryFixture(); f.setBranch(f.commit); f.setPulls([{ ...f.pull(), base: { ref: 'master', repo: { id: 99 } } }]);
    await expect(f.writer.pullRequest(f.commit)).rejects.toThrow(); expect(f.posts()).toEqual([]);
  });
  it.each(['operationId', 'repositoryId', 'baseSha', 'planDigest'])('rejects a foreign installation receipt %s before transport', field => {
    const f = deliveryFixture(), files = f.plan.files.map(file => {
      if (file.path !== '.copilot/setup-manifest.json') return file;
      const manifest = JSON.parse(file.content!); manifest.installation[field] = field === 'repositoryId' ? 99 : field === 'operationId'
        ? '12345678-1234-4234-8234-123456789abd' : field === 'baseSha' ? 'f'.repeat(40) : 'f'.repeat(64);
      return { ...file, content: JSON.stringify(manifest) };
    });
    expect(() => new SetupInstallationGithubDeliveryAdapter(f.transport, { ...f.plan, files }, 'private-fixture-token', f.fresh)).toThrow('unknown');
    expect(f.transport.call).not.toHaveBeenCalled();
  });
  it('rejects a future installation receipt shape before transport', () => {
    const f = deliveryFixture(), files = f.plan.files.map(file => {
      if (file.path !== '.copilot/setup-manifest.json') return file;
      const manifest = JSON.parse(file.content!); manifest.installation.schemaVersion = 2;
      return { ...file, content: JSON.stringify(manifest) };
    });
    expect(() => new SetupInstallationGithubDeliveryAdapter(f.transport, { ...f.plan, files }, 'private-fixture-token', f.fresh)).toThrow('unknown');
    expect(f.transport.call).not.toHaveBeenCalled();
  });
  it('does not invent a final manifest when approved files omit it', () => {
    const f = deliveryFixture(); expect(() => new SetupInstallationGithubDeliveryAdapter(f.transport,
      { ...f.plan, files: f.plan.files.filter(file => file.path !== '.copilot/setup-manifest.json') }, 'private-fixture-token', f.fresh)).toThrow('unknown');
    expect(f.transport.call).not.toHaveBeenCalled();
  });
  it('can update the receipt while an approved workflow remains unchanged', async () => {
    const f = deliveryFixture(true); expect(await f.writer.prepareCommit()).toBe(f.commit);
    expect(f.preparedFiles.get(SETUP_PUBLISHER_WORKFLOW_PATH)).toBe(f.plan.files[0].content);
    expect(f.preparedFiles.get('.github/workflows/human.yml')).toBe('human workflow');
  });
});
