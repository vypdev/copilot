import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createSetupPublisherInstallationCompositionRoot } from '../composition/setup_publisher_installation_composition_root';
import { getOctokitClient } from '../github/octokit_client_resolver';
import { SetupPublisherJournalAdapter } from '../setup_publisher_journal_adapter';
import { setupPublisherGithubFixture, operation } from './fixtures/setup_publisher_github_fixture';
import { setupInstallationTreeFixture } from './fixtures/setup_installation_tree_fixture';
import type { SetupPublisherPlan } from '../../domain/setup_publisher_installation';
import { resolveStaticSetupPublisherCatalog } from '../../application/policies/setup_publisher_message_catalog';

let mockJournalRoot: string;
jest.mock('../github/octokit_client_resolver', () => ({ getOctokitClient: jest.fn() }));
jest.mock('../setup_publisher_journal_adapter', () => {
  const actual = jest.requireActual<typeof import('../setup_publisher_journal_adapter')>('../setup_publisher_journal_adapter');
  return { SetupPublisherJournalAdapter: jest.fn().mockImplementation(() => new actual.SetupPublisherJournalAdapter(mockJournalRoot)) };
});
beforeEach(async () => { jest.clearAllMocks(); mockJournalRoot = await mkdtemp(join(tmpdir(), 'publisher-real-composition-')); });
afterEach(async () => { await rm(mockJournalRoot, { recursive: true, force: true }); });

function fixture(locale = 'en-US') {
  const f = setupPublisherGithubFixture(), hash = (content: string) => createHash('sha256').update(content).digest('hex');
  f.proposal.source.actionManifestSha256 = hash(f.files['action.yml']);
  f.proposal.source.actionBundleSha256 = hash(f.files['build/github_action/index.js']);
  jest.mocked(getOctokitClient).mockReturnValue({ request: f.request });
  const present = jest.fn(async (_plan: SetupPublisherPlan) => undefined);
  const confirm = jest.fn(async (): Promise<'approve' | 'decline' | 'cancel'> => 'decline');
  const active = jest.fn(() => true);
  const install = createSetupPublisherInstallationCompositionRoot('private-factory-fixture', { present, confirm, active }, locale);
  const execute = (dryRun = true, resume = false) => install.execute({ proposal: f.proposal, operationId: operation, dryRun, resume });
  return { ...f, present, confirm, active, install, execute };
}
it('publisher977-C109: composition resolves its own validated record location without provider effects', async () => {
  const f = fixture();
  const navigation = f.install as unknown as { operationLocation?: (id: string) => Promise<string | undefined> };
  expect(await navigation.operationLocation?.(operation)).toBeUndefined();
  expect(await readdir(mockJournalRoot)).toEqual([]);
  await new SetupPublisherJournalAdapter(mockJournalRoot).save({ schemaVersion: 2, purpose: 'bugbot-status-publisher',
    operationId: operation, repositoryId: 42, repository: 'owner/project', defaultBranch: 'main',
    baseSha: 'a'.repeat(40), sourceCommit: 'b'.repeat(40), planDigest: 'c'.repeat(64),
    approvalDigest: 'd'.repeat(64), actorId: 7, status: 'ready', effects: [] });
  expect(await navigation.operationLocation?.(operation)).toBe(pathToFileURL(join(mockJournalRoot, `${operation}.json`)).href);
  expect(f.request).not.toHaveBeenCalled();
});

it.each(['dry-run', 'decline', 'cancel'] as const)('uses the actual narrow source/destination composition for %s with no write or journal effects', async action => {
  const f = fixture(); if (action === 'cancel') f.confirm.mockResolvedValue('cancel');
  expect(await f.execute(action === 'dry-run')).toMatchObject({ stage: action === 'dry-run' ? 'dry-run' : action === 'cancel' ? 'cancelled' : 'declined' });
  expect(f.present).toHaveBeenCalledWith(expect.objectContaining({ status: 'review', files: expect.any(Array) }), undefined);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  expect(f.request.mock.calls.some(([route]) => /\/orgs\/|\/secrets|\/variables|\/labels/u.test(route))).toBe(false);
  expect(await readdir(mockJournalRoot)).toEqual([]); expect(SetupPublisherJournalAdapter).toHaveBeenCalledWith();
  expect(JSON.stringify(f.install)).not.toContain('private-factory-fixture');
  expect(jest.mocked(getOctokitClient).mock.calls.every(([token]) => token === 'private-factory-fixture')).toBe(true);
});
it('invalid credentials stop the actual composition before any provider or journal construction', () => {
  expect(() => createSetupPublisherInstallationCompositionRoot('', { present: async () => undefined, confirm: async () => 'approve', active: () => true })).toThrow('credential is unavailable');
  expect(getOctokitClient).not.toHaveBeenCalled(); expect(SetupPublisherJournalAdapter).not.toHaveBeenCalled();
});
it('an explicit unknown resume stops locally before provider reads or a misleading preview', async () => {
  const f = fixture(); await expect(f.execute(true, true)).rejects.toMatchObject({ reason: 'resume-missing' });
  expect(f.request).not.toHaveBeenCalled(); expect(f.present).not.toHaveBeenCalled(); expect(await readdir(mockJournalRoot)).toEqual([]);
});
it('cancellation before inspection creates no provider, journal or approval effects', async () => {
  const f = fixture(); f.active.mockReturnValue(false);
  await expect(f.execute(false)).rejects.toMatchObject({ reason: 'cancelled' }); expect(f.request).not.toHaveBeenCalled(); expect(f.confirm).not.toHaveBeenCalled(); expect(await readdir(mockJournalRoot)).toEqual([]);
});
it('cancellation during an authenticated read stops subsequent GETs and cannot complete as a preview', async () => {
  const f = fixture(), original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (route, p) => { const result = await original(route, p); f.active.mockReturnValue(false); return result; });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'cancelled' });
  expect(f.request).toHaveBeenCalledTimes(1); expect(f.present).not.toHaveBeenCalled(); expect(await readdir(mockJournalRoot)).toEqual([]);
});
it('publisher-inventory-C40: cancellation during evidence inspection stops the next actual transport dispatch', async () => {
  const f = fixture(), original = f.request.getMockImplementation()!, head = '6'.repeat(40);
  Object.assign(f.proposal, { schemaVersion: 2, inventoryReview: { pullRequest: 81, head, documentSha256: 'a'.repeat(64) } });
  f.request.mockImplementation(async (route, p) => {
    if (route === 'GET /repos/{owner}/{repo}/pulls/{pull_number}' && p.owner === 'owner' && p.pull_number === 81) {
      f.active.mockReturnValue(false);
      return { data: { number: 81, state: 'open', merged: false, user: { id: 9, type: 'User' },
        head: { sha: head, repo: { id: 42, full_name: 'owner/project' } },
        base: { sha: '7'.repeat(40), repo: { id: 42, full_name: 'owner/project' } } } };
    }
    return original(route, p);
  });
  await expect(f.execute(false)).rejects.toMatchObject({ reason: 'cancelled' });
  const evidenceRead = f.request.mock.calls.findIndex(([r, p]) => r.endsWith('/pulls/{pull_number}') && p.pull_number === 81);
  expect(evidenceRead).toBeGreaterThan(0); expect(f.request.mock.calls).toHaveLength(evidenceRead + 1);
  expect(f.present).not.toHaveBeenCalled(); expect(f.confirm).not.toHaveBeenCalled();
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  expect(await readdir(mockJournalRoot)).toEqual([]);
});
it.each(['en-US', 'es-ES', 'fr-FR', 'pt-BR'])('connects real approval and exact common delivery to one controlled PR with %s metadata', async locale => {
  const f = fixture(locale), original = f.request.getMockImplementation()!, commit = 'c'.repeat(40), catalog = resolveStaticSetupPublisherCatalog(locale);
  const prepared = new Map(f.baseFiles); let tree = setupInstallationTreeFixture(prepared, f.modes), branch: string | undefined;
  let pulls: unknown[] = [], reviewed: SetupPublisherPlan | undefined;
  f.present.mockImplementation(async plan => { reviewed = plan; }); f.confirm.mockResolvedValue('approve');
  f.request.mockImplementation(async (route, p) => {
    if (p.owner !== 'owner' || p.repo !== 'project') return original(route, p);
    if (route === 'POST /repos/{owner}/{repo}/git/trees') {
      expect(p.base_tree).toBe(setupInstallationTreeFixture(f.baseFiles, f.modes).root);
      expect(p.tree).toEqual(reviewed!.files.map(file => ({ ...file, type: 'blob', mode: '100644' })));
      for (const file of p.tree as { path: string; content: string }[]) prepared.set(file.path, file.content);
      tree = setupInstallationTreeFixture(prepared, f.modes); return { data: { sha: tree.root } };
    }
    if (route === 'POST /repos/{owner}/{repo}/git/commits') {
      expect(p.parents).toEqual([f.proposal.destination.head]); expect(p.tree).toBe(tree.root); return { data: { sha: commit } };
    }
    if (route.endsWith('/git/commits/{commit_sha}') && p.commit_sha === commit) return { data: { sha: commit, parents: [{ sha: f.proposal.destination.head }], tree: { sha: tree.root } } };
    if (route.endsWith('/git/trees/{tree_sha}') && !(String(p.tree_sha) in f.trees) && tree.trees.has(String(p.tree_sha))) return { data: tree.trees.get(String(p.tree_sha)) };
    if (route.endsWith('/contents/{path}')) return { data: { encoding: 'base64', content: Buffer.from(prepared.get('.copilot/setup-manifest.json')!).toString('base64') } };
    if (route.endsWith('/git/ref/{ref}') && p.ref === `heads/setup/copilot/${operation}`) {
      if (!branch) throw { status: 404 }; return { data: { object: { sha: branch } } };
    }
    if (route === 'POST /repos/{owner}/{repo}/git/refs') {
      expect(p.ref).toBe(`refs/heads/setup/copilot/${operation}`); expect(p.sha).toBe(commit); branch = commit; return { data: {} };
    }
    if (route === 'GET /repos/{owner}/{repo}/pulls') return { data: pulls };
    if (route === 'POST /repos/{owner}/{repo}/pulls') {
      expect(p.head).toBe(`setup/copilot/${operation}`); expect(p.base).toBe('main');
      expect(p.title).toBe(catalog.message('prTitle')); expect(p.body).toContain(catalog.message('prBody', { commit: f.proposal.source.commit }));
      pulls = [{ number: 73, state: 'open', body: p.body, head: { ref: p.head, sha: commit, repo: { id: 42 } }, base: { ref: 'main', repo: { id: 42 } } }];
      return { data: pulls[0] };
    }
    return original(route, p);
  });
  expect(await f.execute(false)).toMatchObject({ stage: 'apply', result: { status: 'waiting-for-merge', pullRequestNumber: 73 } });
  expect(f.request.mock.calls.filter(([route]) => route.startsWith('POST ')).map(([route]) => route)).toEqual([
    'POST /repos/{owner}/{repo}/git/trees', 'POST /repos/{owner}/{repo}/git/commits', 'POST /repos/{owner}/{repo}/git/refs', 'POST /repos/{owner}/{repo}/pulls',
  ]);
  expect(await readdir(mockJournalRoot)).toEqual([operation + '.json']);
  const raw = await readFile(join(mockJournalRoot, operation + '.json'), 'utf8');
  expect(raw).not.toContain('private-factory-fixture'); expect(JSON.parse(raw)).toMatchObject({ purpose: 'bugbot-status-publisher', effects: ['tree', 'commit', 'branch', 'pull-request'], preparedCommit: commit });
  expect(JSON.stringify(f.install)).not.toContain('private-factory-fixture');
});

it('publisher977-C101: actual composition blocks an opaque script before preview, approval or provider writes', async () => {
  const f = fixture();
  f.replace('ci.yml', 'on: push\njobs:\n  status:\n    steps:\n      - run: node scripts/dispatch-status.js\n');
  await expect(f.execute(false)).rejects.toMatchObject({ reason: 'planning', planFailure: 'installation-unsupported' });
  expect(f.present).not.toHaveBeenCalled(); expect(f.confirm).not.toHaveBeenCalled();
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  expect(await readdir(mockJournalRoot)).toEqual([]);
});
