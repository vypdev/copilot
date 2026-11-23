import { DeliverSetupInstallationUseCase } from '../../application/usecases/setup/deliver_setup_installation_use_case';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReviewSetupPublisherUseCase } from '../../application/usecases/setup/review_setup_publisher_use_case';
import { ApplySetupPublisherUseCase } from '../../application/usecases/setup/apply_setup_publisher_use_case';
import { InstallSetupPublisherUseCase } from '../../application/usecases/setup/install_setup_publisher_use_case';
import { setupPublisherFixture } from '../../application/policies/__tests__/fixtures/setup_publisher_fixture';
import { setupBatchMarker, setupBatchBranch } from '../../application/policies/setup_batch_policy';
import { planSetupPublisherInstallation } from '../../application/policies/setup_publisher_plan_policy';
import { SetupPublisherJournalAdapter } from '../setup_publisher_journal_adapter';
import { SetupInstallationGithubDeliveryAdapter } from '../setup_installation_github_delivery_adapter';
import { SetupBatchProviderError } from '../setup_batch_github_read_adapter';
import type { SetupPublisherPlan, SetupPublisherOperation } from '../../domain/setup_publisher_installation';
import { setupInstallationTreeFixture } from './fixtures/setup_installation_tree_fixture';
const filesystem = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');

// Preserve phase evidence if the unchanged CI test deadline expires.
jest.requireActual<{ installJournalIoDiagnostics(): void }>('./fixtures/journal_io_diagnostics.cjs').installJournalIoDiagnostics();

const id = '12345678-1234-4234-8234-123456789abc', commit = 'c'.repeat(40);
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'publisher-composed-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
function fixture() {
  const data = setupPublisherFixture(), session = {}, journal = new SetupPublisherJournalAdapter(root);
  const baseFiles = new Map([['README.md', 'Human source'], ...data.inspection.installation.guidance.map(file => [file.path, file.content] as const),
    ...data.inspection.installation.workflows.map(file => [file.path, file.content] as const),
    [data.inspection.installation.manifest!.path, data.inspection.installation.manifest!.content]]);
  const baseTree = setupInstallationTreeFixture(baseFiles), prepared = new Map(baseFiles), active = jest.fn(() => true);
  let branch: string | undefined, pulls: unknown[] = [], plan: SetupPublisherPlan | undefined;
  let transform = (_route: string, value: unknown, _parameters: Record<string, unknown>): unknown => value;
  const transport = { call: jest.fn(async (token: string, route: string, parameters: Record<string, unknown>): Promise<unknown> => {
    expect(token).toBe('private-fixture-token'); expect(parameters).toMatchObject({ owner: 'owner', repo: 'project' });
    let value: unknown;
    if (route === 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}') value = parameters.commit_sha === data.inspection.target.baseSha
      ? { sha: data.inspection.target.baseSha, tree: { sha: baseTree.root } }
      : { sha: commit, parents: [{ sha: data.inspection.target.baseSha }], tree: { sha: setupInstallationTreeFixture(prepared).root } };
    else if (route === 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}') value = baseTree.trees.get(String(parameters.tree_sha))
      ?? setupInstallationTreeFixture(prepared).trees.get(String(parameters.tree_sha));
    else if (route === 'GET /repos/{owner}/{repo}/contents/{path}') value = { encoding: 'base64', content: Buffer.from(prepared.get('.copilot/setup-manifest.json')!).toString('base64') };
    else if (route === 'POST /repos/{owner}/{repo}/git/trees') {
      expect(parameters.base_tree).toBe(baseTree.root);
      expect(parameters.tree).toEqual(plan!.files.map(file => ({ ...file, type: 'blob', mode: '100644' })));
      for (const file of parameters.tree as { path: string; content: string }[]) prepared.set(file.path, file.content);
      value = { sha: setupInstallationTreeFixture(prepared).root };
    } else if (route === 'POST /repos/{owner}/{repo}/git/commits') {
      expect(parameters.parents).toEqual([data.inspection.target.baseSha]); expect(parameters.tree).toBe(setupInstallationTreeFixture(prepared).root); value = { sha: commit };
    } else if (route === 'GET /repos/{owner}/{repo}/git/ref/{ref}') {
      expect(parameters.ref).toBe(`heads/${setupBatchBranch(id)}`); if (!branch) throw new SetupBatchProviderError('not-found'); value = { object: { sha: branch } };
    } else if (route === 'POST /repos/{owner}/{repo}/git/refs') {
      expect(parameters.ref).toBe(`refs/heads/${setupBatchBranch(id)}`); expect(parameters.sha).toBe(commit); branch = commit; value = {};
    } else if (route === 'GET /repos/{owner}/{repo}/pulls') value = pulls;
    else if (route === 'POST /repos/{owner}/{repo}/pulls') {
      expect(parameters.head).toBe(setupBatchBranch(id)); expect(parameters.base).toBe('main');
      pulls = [{ state: 'open', number: 73, body: parameters.body, head: { ref: setupBatchBranch(id), sha: commit, repo: { id: 42 } },
        base: { ref: 'main', repo: { id: 42 } } }]; value = pulls[0];
    } else throw new Error('Unexpected provider route outside approved file delivery.');
    return transform(route, value, parameters);
  }) };
  const confirm = jest.fn(async (): Promise<'approve' | 'decline'> => 'approve');
  const present = jest.fn(async (value: SetupPublisherPlan, _retained?: SetupPublisherOperation) => { plan = value; });
  const review = () => new ReviewSetupPublisherUseCase({
    inspect: async () => ({ inspection: data.inspection, session }), present, confirm, active,
  });
  const apply = () => new ApplySetupPublisherUseCase({ coordinator: new DeliverSetupInstallationUseCase(), journal, active,
      delivery: (value, identity, revalidate) => {
        expect(value).toBe(plan); expect(identity).toBe(session);
        return new SetupInstallationGithubDeliveryAdapter(transport, { target: value.target, operationId: value.operationId,
          digest: value.digest, files: value.files, title: 'Install reviewed publisher', body: setupBatchMarker(id, value.target.id) }, 'private-fixture-token', revalidate);
      },
    });
  const execute = (reviewed?: SetupPublisherOperation, dryRun = false) => review()
    .execute({ proposal: data.proposal, operationId: id, dryRun }, (approved, actualSession, fresh) => {
      expect(actualSession).toBe(session);
      return apply().execute(approved, actualSession, fresh, reviewed);
    });
  const executeInstalled = (resume: boolean) => new InstallSetupPublisherUseCase(review(), apply(), journal)
    .execute({ proposal: data.proposal, operationId: id, dryRun: false, resume });
  const posts = () => transport.call.mock.calls.filter(([, route]) => route.startsWith('POST ')).map(([, route]) => route);
  return { ...data, journal, transport, active, confirm, present, execute, executeInstalled, posts, prepared,
    transform: (next: typeof transform) => { transform = next; }, setBranch: (sha: string | undefined) => { branch = sha; },
    setPulls: (value: unknown[]) => { pulls = value; } };
}

it('publisher977-C125 reports real lock-release failure with the completed PR and resumes only after confirmed orphan recovery', async () => {
  const f = fixture(), destination = join(root, `${id}.json.lock`), original = filesystem.unlink;
  const fault = jest.spyOn(filesystem, 'unlink').mockImplementation(async path => {
    if (path === destination) throw Object.assign(new Error('private-release-cause'), { code: 'EACCES' });
    return original(path);
  });
  try {
    const error = await f.executeInstalled(false).catch((failure: unknown) => failure) as {
      reason?: string; message?: string; retained?: SetupPublisherOperation; lastPersisted?: SetupPublisherOperation;
    };
    expect(error).toMatchObject({ reason: 'journal', retained: { status: 'waiting-for-merge', pullRequestNumber: 73 },
      lastPersisted: { status: 'waiting-for-merge', pullRequestNumber: 73 } });
    expect(error.message).not.toContain('private-release-cause');
    const durable = await f.journal.load(id); expect(durable).toEqual(error.lastPersisted);
    const lock = await readFile(destination, 'utf8');
    expect(JSON.parse(lock)).toMatchObject({ pid: process.pid, nonce: expect.stringMatching(/^[a-f0-9]{32}$/u) });
    const posts = [...f.posts()]; expect(posts).toHaveLength(4);
    await expect(f.executeInstalled(true)).rejects.toMatchObject({ reason: 'journal' });
    expect(f.posts()).toEqual(posts); expect(await readFile(destination, 'utf8')).toBe(lock);
    fault.mockRestore();
    // All fixture owners stopped; remove only this verified private test lock.
    await original(destination);
    expect(await f.executeInstalled(true)).toMatchObject({ stage: 'apply', result: { status: 'waiting-for-merge', pullRequestNumber: 73 } });
    expect(f.posts()).toEqual(posts); expect(await f.journal.load(id)).toEqual(durable);
    expect(await readdir(root)).toEqual([`${id}.json`]);
  } finally { fault.mockRestore(); }
});

it('publisher977-C96: cancelled preparation intent resumes through the real v2 journal after fresh approval', async () => {
  const f = fixture(), save = f.journal.save.bind(f.journal); let cancelled = false;
  jest.spyOn(f.journal, 'save').mockImplementation(async state => {
    await save(state);
    if (!cancelled && state.uncertain === 'tree' && state.effects.length === 0) {
      cancelled = true; f.active.mockReturnValue(false);
    }
  });
  const error = await f.executeInstalled(false).catch((failure: unknown) => failure) as { reason: string; retained: SetupPublisherOperation };
  expect(error).toMatchObject({ reason: 'cancelled', retained: { status: 'cancelled' } });
  expect(error.retained.uncertain).toBeUndefined();
  expect(cancelled).toBe(true); expect(f.posts()).toEqual([]);
  const retained = await f.journal.load(id);
  expect(retained).toMatchObject({ status: 'cancelled', effects: [] }); expect(retained?.uncertain).toBeUndefined();
  f.active.mockReturnValue(true);
  expect(await f.executeInstalled(true)).toMatchObject({ stage: 'apply', result: { status: 'waiting-for-merge', pullRequestNumber: 73 } });
  expect(f.confirm).toHaveBeenCalledTimes(2);
  expect(f.posts().filter(route => route.endsWith('/git/trees'))).toHaveLength(1);
});

it('publisher977-C08: an old partial approval receipt cannot authorize unfinished writes after fresh decline', async () => {
  const f = fixture(), route = 'POST /repos/{owner}/{repo}/git/refs';
  const original = f.transport.call.getMockImplementation()!; let interrupted = false;
  f.transport.call.mockImplementation(async (token, actual, parameters) => {
    if (!interrupted && actual === route) { interrupted = true; throw new SetupBatchProviderError('transient'); }
    return original(token, actual, parameters);
  });
  await expect(f.executeInstalled(false)).rejects.toMatchObject({ reason: 'delivery', retained: { uncertain: 'branch' } });
  const retained = await f.journal.load(id), before = [...f.posts()], file = join(root, `${id}.json`);
  const receipt = await readFile(file, 'utf8');
  expect(retained).toMatchObject({ status: 'partial', uncertain: 'branch', effects: ['tree', 'commit'] });
  expect(retained?.approvalDigest).toMatch(/^[a-f0-9]{64}$/u);
  f.confirm.mockResolvedValue('decline');
  expect(await f.executeInstalled(true)).toMatchObject({ stage: 'declined' });
  expect(f.confirm).toHaveBeenCalledTimes(2); expect(f.present.mock.calls[1][1]).toEqual(retained);
  expect(f.posts()).toEqual(before); expect(await readFile(file, 'utf8')).toBe(receipt);
  expect(await readdir(root)).toEqual([`${id}.json`]);
  f.confirm.mockResolvedValue('approve');
  expect(await f.executeInstalled(true)).toMatchObject({ stage: 'apply', result: { status: 'waiting-for-merge', pullRequestNumber: 73 } });
  expect(f.confirm).toHaveBeenCalledTimes(3);
  expect(f.posts().filter(actual => actual.endsWith('/git/trees'))).toHaveLength(1);
  expect(f.posts().filter(actual => actual.endsWith('/git/commits'))).toHaveLength(1);
  expect(f.posts().filter(actual => actual === route)).toHaveLength(2);
});

it.each(['branch', 'pull-request'] as const)('publisher recovery: fresh reviewed resume creates a confirmed-absent uncertain %s without replaying Git objects', async kind => {
  const f = fixture(), route = kind === 'branch' ? 'POST /repos/{owner}/{repo}/git/refs' : 'POST /repos/{owner}/{repo}/pulls';
  const original = f.transport.call.getMockImplementation()!;
  let interrupted = false;
  f.transport.call.mockImplementation(async (token, actual, parameters) => {
    if (!interrupted && actual === route) { interrupted = true; throw new SetupBatchProviderError('transient'); }
    return original(token, actual, parameters);
  });
  await expect(f.executeInstalled(false)).rejects.toMatchObject({ reason: 'delivery', retained: { uncertain: kind } });
  const retained = await f.journal.load(id), before = f.transport.call.mock.calls.length;
  expect(retained?.effects).toEqual(kind === 'branch' ? ['tree', 'commit'] : ['tree', 'commit', 'branch']);
  expect(await f.executeInstalled(true)).toMatchObject({ stage: 'apply', result: { status: 'waiting-for-merge', pullRequestNumber: 73 } });
  expect(f.confirm).toHaveBeenCalledTimes(2); expect(f.present.mock.calls[1][1]).toEqual(retained);
  const resumed = f.transport.call.mock.calls.slice(before).map(([, actual]) => actual);
  const inspection = kind === 'branch' ? 'GET /repos/{owner}/{repo}/git/ref/{ref}' : 'GET /repos/{owner}/{repo}/pulls';
  expect(resumed.indexOf(inspection)).toBeGreaterThanOrEqual(0);
  expect(resumed.indexOf(inspection)).toBeLessThan(resumed.indexOf(route));
  expect(f.posts().filter(actual => actual.endsWith('/git/trees'))).toHaveLength(1);
  expect(f.posts().filter(actual => actual.endsWith('/git/commits'))).toHaveLength(1);
  expect(f.posts().filter(actual => actual === route)).toHaveLength(2);
  expect((await f.journal.load(id))?.uncertain).toBeUndefined();
});

it.each(['branch', 'pull-request'] as const)('publisher recovery: reviewed resume adopts an existing uncertain %s after a lost response without repeating its POST', async kind => {
  const f = fixture(), route = kind === 'branch' ? 'POST /repos/{owner}/{repo}/git/refs' : 'POST /repos/{owner}/{repo}/pulls';
  const inspection = kind === 'branch' ? 'GET /repos/{owner}/{repo}/git/ref/{ref}' : 'GET /repos/{owner}/{repo}/pulls';
  let responseLost = false;
  f.transform((actual, value) => {
    if (actual === route) { responseLost = true; throw new SetupBatchProviderError('transient'); }
    if (responseLost && actual === inspection) throw new SetupBatchProviderError('unknown');
    return value;
  });
  await expect(f.executeInstalled(false)).rejects.toMatchObject({ retained: { uncertain: kind } });
  f.transform((_actual, value) => value);
  expect(await f.executeInstalled(true)).toMatchObject({ result: { status: 'waiting-for-merge', pullRequestNumber: 73 } });
  expect(f.posts().filter(actual => actual === route)).toHaveLength(1);
  expect(f.posts().filter(actual => actual.endsWith('/git/trees'))).toHaveLength(1);
  expect(f.posts().filter(actual => actual.endsWith('/git/commits'))).toHaveLength(1);
  expect(f.confirm).toHaveBeenCalledTimes(2);
});

it.each(['branch', 'pull-request'] as const)('publisher recovery: reviewed uncertain %s recovery refuses a conflicting identity without a replacement POST', async kind => {
  const f = fixture(), route = kind === 'branch' ? 'POST /repos/{owner}/{repo}/git/refs' : 'POST /repos/{owner}/{repo}/pulls';
  const inspection = kind === 'branch' ? 'GET /repos/{owner}/{repo}/git/ref/{ref}' : 'GET /repos/{owner}/{repo}/pulls';
  let responseLost = false;
  f.transform((actual, value) => {
    if (actual === route) { responseLost = true; throw new SetupBatchProviderError('transient'); }
    if (responseLost && actual === inspection) throw new SetupBatchProviderError('unknown');
    return value;
  });
  await expect(f.executeInstalled(false)).rejects.toMatchObject({ retained: { uncertain: kind } });
  const before = f.posts().length;
  if (kind === 'branch') { f.setBranch('f'.repeat(40)); f.transform((_actual, value) => value); }
  else f.transform((actual, value) => actual === 'GET /repos/{owner}/{repo}/pulls'
    ? (value as { head: Record<string, unknown> }[]).map(pull => ({ ...pull, head: { ...pull.head, sha: 'f'.repeat(40) } })) : value);
  await expect(f.executeInstalled(true)).rejects.toMatchObject({ reason: 'delivery', retained: { uncertain: kind } });
  expect(f.posts()).toHaveLength(before); expect(f.confirm).toHaveBeenCalledTimes(2);
});

it.each(['branch', 'pull-request'] as const)('publisher recovery: a completed publisher receipt never recreates a missing %s', async kind => {
  const f = fixture(); await f.executeInstalled(false); const saved = await f.journal.load(id), before = f.posts().length;
  if (kind === 'branch') f.setBranch(undefined); else f.setPulls([]);
  await expect(f.executeInstalled(true)).rejects.toMatchObject({ reason: 'delivery', lastPersisted: saved });
  expect(f.posts()).toHaveLength(before); expect(await f.journal.load(id)).toEqual(saved);
});

it('keeps the credential out of the concrete delivery object exposed through the semantic application port', () => {
  const f = setupPublisherFixture(), plan = planSetupPublisherInstallation(f.proposal, f.inspection, id);
  const writer = new SetupInstallationGithubDeliveryAdapter({ call: async () => undefined }, {
    target: plan.target, operationId: plan.operationId, digest: plan.digest, files: plan.files,
    title: 'Install reviewed publisher', body: setupBatchMarker(id, plan.target.id),
  }, 'private-port-credential-fixture', async () => true);
  expect(JSON.stringify(writer)).not.toContain('private-port-credential-fixture');
  expect(Object.values(writer)).not.toContain('private-port-credential-fixture');
});

it('composes complete immutable review, actual private storage and shared exact-tree/ref/PR delivery', async () => {
  const f = fixture(); expect(await f.execute()).toMatchObject({ stage: 'apply', result: { status: 'waiting-for-merge', pullRequestNumber: 73 } });
  const saved = await f.journal.load(id); expect(saved?.effects).toEqual(['tree', 'commit', 'branch', 'pull-request']);
  expect(f.posts()).toEqual(['POST /repos/{owner}/{repo}/git/trees', 'POST /repos/{owner}/{repo}/git/commits',
    'POST /repos/{owner}/{repo}/git/refs', 'POST /repos/{owner}/{repo}/pulls']);
  expect(await readdir(root)).toEqual([`${id}.json`]); expect(JSON.stringify(saved)).not.toContain('private-fixture-token');
  expect(f.present.mock.calls[0][0].nativeVerification).toBe('pending');
});
it.each(['dry-run', 'decline'])('a composed %s creates neither a journal nor a provider request', async mode => {
  const f = fixture(); if (mode === 'decline') f.confirm.mockResolvedValue('decline');
  expect(await f.execute(undefined, mode === 'dry-run')).toMatchObject({ stage: mode === 'dry-run' ? 'dry-run' : 'declined' });
  expect(f.transport.call).not.toHaveBeenCalled(); expect(await readdir(root)).toEqual([]);
});
it('retains a known tree after cancellation before the commit POST and resumes without another tree POST', async () => {
  const f = fixture(); f.transform((route, value) => { if (route === 'POST /repos/{owner}/{repo}/git/trees') f.active.mockReturnValue(false); return value; });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled', retained: { status: 'partial', effects: ['tree'] } });
  const retained = await f.journal.load(id); expect(retained?.preparedTree).toBeTruthy(); expect(retained?.uncertain).toBeUndefined();
  f.transform((_route, value) => value); f.active.mockReturnValue(true); await f.execute(retained);
  expect(f.posts().filter(route => route.endsWith('/git/trees'))).toHaveLength(1); expect(f.posts().filter(route => route.endsWith('/git/commits'))).toHaveLength(1);
});
it('does not claim an unknown commit outcome when the provider adapter stopped before issuing its POST', async () => {
  const f = fixture(); f.transform((route, value) => { if (route === 'POST /repos/{owner}/{repo}/git/trees') f.active.mockReturnValue(false); return value; });
  await expect(f.execute()).rejects.toMatchObject({ retained: { effects: ['tree'] } });
  expect(f.posts()).toEqual(['POST /repos/{owner}/{repo}/git/trees']);
  expect((await f.journal.load(id))?.uncertain).toBeUndefined();
});
it.each(['tree', 'commit'] as const)('an actually unknown %s POST outcome remains uncertain and is never replayed', async kind => {
  const f = fixture(), route = kind === 'tree' ? 'POST /repos/{owner}/{repo}/git/trees' : 'POST /repos/{owner}/{repo}/git/commits';
  f.transform((actual, value) => { if (actual === route) throw new SetupBatchProviderError('transient'); return value; });
  await expect(f.execute()).rejects.toMatchObject({ retained: { uncertain: kind } }); const retained = await f.journal.load(id), posts = f.posts().length;
  await expect(f.execute(retained)).rejects.toMatchObject({ reason: 'uncertain-preparation' }); expect(f.posts()).toHaveLength(posts);
});
it('a failed base read before any POST retains a blocked operation without inventing an unknown tree creation', async () => {
  const f = fixture(); f.transform((route, value) => { if (route.includes('/git/commits/')) throw new SetupBatchProviderError('unknown'); return value; });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'delivery', retained: { status: 'blocked', effects: [] } });
  expect(f.posts()).toEqual([]); const retained = await f.journal.load(id); expect(retained?.uncertain).toBeUndefined();
  f.transform((_route, value) => value); await f.execute(retained); expect(f.posts().filter(route => route.endsWith('/git/trees'))).toHaveLength(1);
});
it.each(['tree', 'commit', 'branch', 'pull-request'] as const)('publisher977-C41: a denied %s write retains partial facts without escalation, probes or blind POST replay', async kind => {
  const f = fixture(), effects = ['tree', 'commit', 'branch', 'pull-request'];
  const routes = ['POST /repos/{owner}/{repo}/git/trees', 'POST /repos/{owner}/{repo}/git/commits',
    'POST /repos/{owner}/{repo}/git/refs', 'POST /repos/{owner}/{repo}/pulls'];
  const index = effects.indexOf(kind), original = f.transport.call.getMockImplementation()!;
  f.transport.call.mockImplementation(async (token, route, parameters) => {
    if (route === routes[index]) throw new SetupBatchProviderError('forbidden');
    return original(token, route, parameters);
  });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'delivery', retained: {
    status: 'partial', effects: effects.slice(0, index), uncertain: kind,
  } });
  expect(f.posts()).toEqual(routes.slice(0, index + 1));
  const saved = await f.journal.load(id), count = f.posts().length, before = f.transport.call.mock.calls.length;
  await expect(f.execute(saved)).rejects.toBeDefined();
  expect(f.posts()).toHaveLength(count + (kind === 'branch' || kind === 'pull-request' ? 1 : 0));
  if (kind === 'branch' || kind === 'pull-request') {
    const resumed = f.transport.call.mock.calls.slice(before).map(([, actual]) => actual);
    const inspect = kind === 'branch' ? 'GET /repos/{owner}/{repo}/git/ref/{ref}' : 'GET /repos/{owner}/{repo}/pulls';
    expect(resumed.indexOf(inspect)).toBeGreaterThanOrEqual(0);
    expect(resumed.indexOf(inspect)).toBeLessThan(resumed.indexOf(routes[index]));
  }
  expect(JSON.stringify(saved)).not.toContain('private-fixture-token');
});
it('a complete journal re-proves the current exact ref and PR without a new POST', async () => {
  const f = fixture(); await f.execute(); const retained = await f.journal.load(id), count = f.posts().length;
  expect(await f.execute(retained)).toMatchObject({ result: { status: 'waiting-for-merge', pullRequestNumber: 73 } }); expect(f.posts()).toHaveLength(count);
  f.setBranch('f'.repeat(40)); await expect(f.execute(retained)).rejects.toMatchObject({ reason: 'delivery' }); expect(f.posts()).toHaveLength(count);
});
it('an extra prepared sibling is retained as an unapproved known tree and cannot become a commit', async () => {
  const f = fixture(); f.transform((route, value) => {
    if (route !== 'POST /repos/{owner}/{repo}/git/trees') return value;
    f.prepared.set('README.md', 'Unapproved change'); return { sha: setupInstallationTreeFixture(f.prepared).root };
  });
  await expect(f.execute()).rejects.toMatchObject({ retained: { status: 'partial', effects: ['tree'] } });
  const retained = await f.journal.load(id), count = f.posts().length; await expect(f.execute(retained)).rejects.toMatchObject({ reason: 'delivery' });
  expect(f.posts()).toHaveLength(count); expect(f.posts().some(route => route.endsWith('/git/commits'))).toBe(false);
});
