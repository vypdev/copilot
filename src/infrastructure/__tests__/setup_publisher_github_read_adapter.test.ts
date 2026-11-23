import { planSetupPublisherInstallation } from '../../application/policies/setup_publisher_plan_policy';
import { SETUP_PUBLISHER_WORKFLOW_PATH } from '../../domain/setup_publisher_installation';
import { setupPublisherGithubFixture as fixture, operation } from './fixtures/setup_publisher_github_fixture';

it('composes actual private credentials, source proof, destination Git objects and immutable planning with GETs only', async () => {
  const f = fixture(), snapshot = await f.reader.inspect(f.proposal);
  expect(snapshot.session).toBe(f.credentials.identity()); expect(snapshot.inspection.target).toEqual(f.baseline.inspection.target);
  expect(snapshot.inspection.installation.complete).toBe(true); expect(snapshot.inspection.installation.publisher).toEqual({ kind: 'absent', paths: [] });
  expect(snapshot.inspection.installation.workflows[0].mode).toBe('100755');
  f.proposal.source.actionManifestSha256 = snapshot.inspection.source.actionManifestSha256;
  f.proposal.source.actionBundleSha256 = snapshot.inspection.source.actionBundleSha256;
  const plan = planSetupPublisherInstallation(f.proposal, snapshot.inspection, operation);
  expect(plan.status).toBe('review'); expect(plan.files.map(file => file.path)).toEqual([SETUP_PUBLISHER_WORKFLOW_PATH, '.copilot/setup-manifest.json']);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  expect(f.request.mock.calls.some(([route]) => /\/orgs\/|\/secrets|\/variables|\/labels|\/issue-types/u.test(route))).toBe(false);
  expect(JSON.stringify(snapshot)).not.toContain('private-source-fixture');
});
it('rejects an invalid local proposal before creating a credential or GitHub observation', async () => {
  const f = fixture(); f.proposal.path = 'other' as typeof f.proposal.path;
  await expect(f.reader.inspect(f.proposal)).rejects.toThrow(); expect(f.request).not.toHaveBeenCalled();
});
it.each([403, 404])('publisher977-C18: unavailable workflow inventory with HTTP %s cannot become readable absence', async status => {
  const f = fixture(), original = f.request.getMockImplementation()!;
  const workflowTree = Object.entries(f.trees).find(([, tree]) => tree.tree.some(entry => entry.path === 'ci.yml'))![0];
  f.request.mockImplementation(async (route, parameters) => {
    if (parameters.owner === 'owner' && route.endsWith('/git/trees/{tree_sha}') && parameters.tree_sha === workflowTree) throw { status };
    return original(route, parameters);
  });
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: status === 403 ? 'forbidden' : 'not-found' });
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it.each(['setup-manifest.json'])('rejects a tree named as required file %s before reading it as a blob', async name => {
  const f = fixture(), entry = f.entries().find(item => item.path === name)!;
  entry.type = 'tree'; entry.mode = '040000'; delete entry.size;
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
  expect(f.request.mock.calls.some(([route, p]) => route.endsWith('/git/blobs/{file_sha}') && p.file_sha === entry.sha)).toBe(false);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it.each([null, {}, { id: 0 }, { id: '7' }])('rejects unknown authenticated identity', async value => {
  const f = fixture(); f.identity.data = value; await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).toHaveBeenCalledTimes(1);
});
it.each([{ id: 0 }, { owner: null }, { owner: { id: 0, login: 'owner' } }, { owner: { id: 9, login: 'other' } },
  { owner: { id: 9 } }, { name: 'other' }, { name: null }, { full_name: 'other/project' }, { full_name: null },
  { default_branch: null }, { private: null }, { archived: null }, { disabled: null }])('rejects contradictory or incomplete destination metadata', async change => {
  const f = fixture(); Object.assign(f.repository, change); await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).toHaveBeenCalledTimes(2);
});
it('rejects a missing destination response', async () => {
  const f = fixture(); f.request.mockResolvedValueOnce(f.identity).mockResolvedValueOnce({ data: null }); await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
});
it.each([{ ref: 'refs/heads/other' }, { object: null }, { object: { type: 'tag', sha: 'a'.repeat(40) } },
  { object: { type: 'commit', sha: 'short' } }])('requires the exact provider default ref and commit identity', async change => {
  const f = fixture(); Object.assign(f.ref, change); await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).toHaveBeenCalledTimes(3);
});
it('rejects a missing default-ref response', async () => {
  const f = fixture(); f.request.mockResolvedValueOnce(f.identity).mockResolvedValueOnce({ data: f.repository }).mockResolvedValueOnce({ data: null });
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
});
it.each([{ archived: true }, { disabled: true }, { permissions: { push: false, admin: false } }, { permissions: undefined }, { default_branch: '../bad' }])(
  'blocks unavailable targets before source or destination object reads', async change => {
    const f = fixture(); Object.assign(f.repository, change);
    if (typeof change.default_branch === 'string') f.ref.ref = `refs/heads/${change.default_branch}`;
    await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'forbidden' }); expect(f.request).toHaveBeenCalledTimes(3);
  });
it('supports a repository owned by a user when the same relevant identity and authority are proven', async () => {
  const f = fixture(); f.repository.owner = { id: 9, login: 'owner', type: 'User' }; f.repository.permissions = { admin: true };
  expect((await f.reader.inspect(f.proposal)).inspection.target.canPush).toBe(true);
});
it.each([
  { header: undefined, privateRepo: true, expected: ['unknown', 'unknown', 'unknown'] },
  { header: 'repo', privateRepo: true, expected: ['write', 'write', 'denied'] },
  { header: 'workflow', privateRepo: true, expected: ['denied', 'denied', 'denied'] },
  { header: 'public_repo,workflow', privateRepo: false, expected: ['write', 'write', 'write'] },
  { header: 'public_repo,workflow', privateRepo: true, expected: ['denied', 'denied', 'denied'] },
])('uses actual granted scopes together with relevant repository access without probing writes', async ({ header, privateRepo, expected }) => {
  const f = fixture(); f.identity.headers = { 'x-oauth-scopes': header, 'x-accepted-github-permissions': 'contents=write,pull_requests=write,workflows=write' }; f.repository.private = privateRepo;
  const { authority, installation } = (await f.reader.inspect(f.proposal)).inspection;
  expect([authority.contents, authority.pullRequests, authority.workflows]).toEqual(expected);
  expect(installation.guidance).toEqual(f.baseline.inspection.installation.guidance);
  expect(f.request.mock.calls.some(([route]) => /\/orgs\/|\/secrets|\/variables|\/labels|\/issue-types/u.test(route))).toBe(false);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it.each([403, 404])('publisher977-C118: unavailable required guidance with HTTP %s cannot produce a fabricated planning snapshot', async status => {
  const f = fixture(), original = f.request.getMockImplementation()!;
  const guidance = f.entries().find(entry => entry.path === 'AGENT_GUIDE.md')!;
  f.request.mockImplementation(async (route, parameters) => {
    if (parameters.owner === 'owner' && route.endsWith('/git/blobs/{file_sha}') && parameters.file_sha === guidance.sha) throw { status };
    return original(route, parameters);
  });
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: status === 403 ? 'forbidden' : 'not-found' });
  expect(f.request.mock.calls.some(([route, p]) => route.endsWith('/git/blobs/{file_sha}') && p.file_sha === guidance.sha)).toBe(true);
  expect(f.request.mock.calls.some(([route]) => /\/orgs\/|\/secrets|\/variables|\/labels|\/issue-types/u.test(route))).toBe(false);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it('reports actual default drift rather than copying the proposal head into inspected facts', async () => {
  const f = fixture(); f.repository.default_branch = 'new-main'; f.ref.ref = 'refs/heads/new-main';
  const snapshot = await f.reader.inspect(f.proposal); expect(snapshot.inspection.target.defaultBranch).toBe('new-main');
  expect(() => planSetupPublisherInstallation(f.proposal, snapshot.inspection, operation)).toThrow('destination-changed');
});
it.each(['setup-manifest.json', 'AGENT_GUIDE.md'])('rejects missing required manifest or declared guidance rather than inventing files', async name => {
  const f = fixture(); for (const t of Object.values(f.trees)) t.tree = t.tree.filter(e => e.path !== name);
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
});
it('rejects unsupported installed metadata before enumerating declared guidance', async () => {
  const f = fixture(); f.replace('setup-manifest.json', '{"schemaVersion":99}'); await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
});
it('proves absent workflow directories from complete ancestors while preserving manifest and guidance', async () => {
  const f = fixture(); for (const t of Object.values(f.trees)) t.tree = t.tree.filter(e => e.path !== 'workflows');
  const installed = (await f.reader.inspect(f.proposal)).inspection.installation;
  expect(installed.workflows).toEqual([]); expect(installed.publisher).toEqual({ kind: 'absent', paths: [] });
});
it('does not mistake a non-directory workflow path for a readable empty inventory', async () => {
  const f = fixture(), e = f.entries().find(e => e.path === 'workflows')!; Object.assign(e, { type: 'blob', mode: '100644', size: 0 });
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
});
it('does not read irrelevant workflow-directory assets as executable workflows', async () => {
  const f = fixture(); const t = Object.values(f.trees).find(t => t.tree.some(e => e.path === 'ci.yml'))!;
  t.tree.push({ path: 'README.md', mode: '100644', type: 'blob', sha: 'a'.repeat(40), size: 10 });
  expect((await f.reader.inspect(f.proposal)).inspection.installation.workflows).toHaveLength(1);
});
it('rejects workflow symlinks and oversized destination assets before fetching them', async () => {
  const f = fixture(), e = f.entries().find(e => e.path === 'ci.yml')!; e.mode = '120000';
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
  e.mode = '100644'; e.size = 100_001; await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
});
it('retains the full relevant inventory count ceiling', async () => {
  const f = fixture(), t = Object.values(f.trees).find(t => t.tree.some(e => e.path === 'ci.yml'))!, entry = t.tree[0];
  t.tree = Array.from({ length: 301 }, (_, n) => ({ ...entry, path: `${n}.yml` }));
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
});
it('retains the combined destination byte ceiling independently of individual file limits', async () => {
  const f = fixture(); f.replace('ci.yml', 'x'.repeat(100_000));
  const t = Object.values(f.trees).find(t => t.tree.some(e => e.path === 'ci.yml'))!, entry = t.tree[0];
  t.tree = Array.from({ length: 21 }, (_, n) => ({ ...entry, path: `${n}.yml` }));
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
});
it('a credential replacement during real composed reads revokes the snapshot before it reaches application review', async () => {
  const f = fixture(), original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (route, p) => { const result = await original(route, p); if (route === 'GET /user') f.credentials.replace('new-fixture'); return result; });
  await expect(f.reader.inspect(f.proposal)).rejects.toThrow('credential is unavailable');
});

it('publisher977-C113 skips unrelated YAML-named directories without reading or counting them as workflows', async () => {
  const f = fixture(), directory = Object.values(f.trees).find(t => t.tree.some(e => e.path === 'ci.yml'))!;
  const ignored = 'f'.repeat(40);
  directory.tree.push({ path: 'archive.yml', mode: '040000', type: 'tree', sha: ignored });
  const snapshot = await f.reader.inspect(f.proposal);
  expect(snapshot.inspection.installation.workflows.map(file => file.path)).toEqual(['.github/workflows/ci.yml']);
  expect(snapshot.inspection.installation.publisher).toEqual({ kind: 'absent', paths: [] });
  expect(f.request.mock.calls.some(([, p]) => p.tree_sha === ignored || p.file_sha === ignored)).toBe(false);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it('publisher977-C113 rejects a directory colliding with the fixed publisher destination before blob transport', async () => {
  const f = fixture(), directory = Object.values(f.trees).find(t => t.tree.some(e => e.path === 'ci.yml'))!;
  const collision = 'e'.repeat(40);
  directory.tree.push({ path: SETUP_PUBLISHER_WORKFLOW_PATH.split('/').at(-1)!, mode: '040000', type: 'tree', sha: collision });
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
  expect(f.request.mock.calls.some(([, p]) => p.tree_sha === collision || p.file_sha === collision)).toBe(false);
});

it('publisher977-C117 ignores an unrelated YAML-named gitlink in actual immutable publisher planning', async () => {
  const f = fixture(), first = (await f.reader.inspect(f.proposal)).inspection;
  f.proposal.source.actionManifestSha256 = first.source.actionManifestSha256;
  f.proposal.source.actionBundleSha256 = first.source.actionBundleSha256;
  expect(planSetupPublisherInstallation(f.proposal, first, operation).status).toBe('review');
  const directory = Object.values(f.trees).find(t => t.tree.some(e => e.path === 'ci.yml'))!;
  const irrelevant = 'f'.repeat(40);
  directory.tree.push({ path: 'archive.yml', mode: '160000', type: 'commit', sha: irrelevant });
  const snapshot = (await f.reader.inspect(f.proposal)).inspection;
  expect(snapshot.installation.workflows.map(file => file.path)).toEqual(['.github/workflows/ci.yml']);
  expect(planSetupPublisherInstallation(f.proposal, snapshot, operation).status).toBe('review');
  expect(f.request.mock.calls.some(([, p]) => p.tree_sha === irrelevant || p.file_sha === irrelevant)).toBe(false);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it('publisher977-C117 rejects a gitlink at the fixed publisher path before fetching it', async () => {
  const f = fixture(), directory = Object.values(f.trees).find(t => t.tree.some(e => e.path === 'ci.yml'))!;
  const collision = 'e'.repeat(40);
  directory.tree.push({ path: SETUP_PUBLISHER_WORKFLOW_PATH.split('/').at(-1)!, mode: '160000', type: 'commit', sha: collision });
  await expect(f.reader.inspect(f.proposal)).rejects.toMatchObject({ code: 'malformed' });
  expect(f.request.mock.calls.some(([, p]) => p.tree_sha === collision || p.file_sha === collision)).toBe(false);
});
