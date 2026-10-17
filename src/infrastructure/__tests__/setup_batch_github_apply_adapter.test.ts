import { SetupBatchGithubApplyAdapter } from '../setup_batch_github_apply_adapter';
import { SetupBatchGithubReadAdapter, SetupBatchGithubTransport, SetupBatchProviderError } from '../setup_batch_github_read_adapter';
import { setupBatchBranch, setupBatchMarker } from '../../application/policies/setup_batch_policy';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import type { SetupBatchTargetPlan } from '../../domain/setup_batch';
import type { SetupRemoteConfiguration } from '../../domain/setup';
const operation = 'a67c8e40-93be-43ed-a7ed-e07378c7e773';
const base = 'a'.repeat(40); const prepared = 'c'.repeat(40);
function fixture() {
  const target = { id: 7, ownerId: 3, owner: 'acme', name: 'repo', defaultBranch: 'master', baseSha: base,
    private: true, archived: false, disabled: false, canPush: true };
  const remote: SetupRemoteConfiguration = { ownerType: 'Organization', repositoryId: 7, repositoryVisibility: 'private',
    defaultBranch: 'master', repositoryVariables: [], organizationVariables: [], repositorySecrets: [], organizationSecrets: ['PAT'],
    repositoryVariablesAccess: 'available', organizationVariablesAccess: 'available', repositorySecretsAccess: 'available',
    organizationSecretsAccess: 'available', organizationAccess: 'available' };
  const plan: SetupBatchTargetPlan = { target, remote, configuration: createDefaultSetupConfiguration(), digest: 'b'.repeat(64),
    blocked: [], files: [{ path: 'AGENTS.md', content: 'generated guidance' }], repositoryVariables: [], grants: [], sharedSnapshot: [] };
  let branch: string | undefined; let pulls: unknown[] = [];
  let installation: unknown = { schemaVersion: 1, operationId: operation, repositoryId: 7, baseSha: base, planDigest: plan.digest };
  const request = jest.fn(async (route: string, parameters: Record<string, unknown>): Promise<{ data: unknown }> => {
    if (route === 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}') return { data: parameters.commit_sha === base
      ? { tree: { sha: 'd'.repeat(40) } } : { parents: [{ sha: base }], tree: { sha: 'e'.repeat(40) } } };
    if (route === 'GET /repos/{owner}/{repo}/contents/{path}') return { data: { encoding: 'base64',
      content: Buffer.from(JSON.stringify({ installation })).toString('base64') } };
    if (route === 'POST /repos/{owner}/{repo}/git/trees') return { data: { sha: 'e'.repeat(40) } };
    if (route === 'POST /repos/{owner}/{repo}/git/commits') return { data: { sha: prepared } };
    if (route === 'GET /repos/{owner}/{repo}/git/ref/{ref}') {
      if (!branch) throw new SetupBatchProviderError('not-found'); return { data: { object: { sha: branch } } };
    }
    if (route === 'POST /repos/{owner}/{repo}/git/refs') { branch = String(parameters.sha); return { data: {} }; }
    if (route === 'GET /repos/{owner}/{repo}/pulls') return { data: pulls };
    if (route === 'POST /repos/{owner}/{repo}/pulls') { pulls = [pull()]; return { data: pull() }; }
    throw new Error('Unexpected fixed route');
  });
  const read = new SetupBatchGithubReadAdapter(new SetupBatchGithubTransport({ getClient: () => ({ request }) }), { inspect: async () => remote });
  jest.spyOn(read, 'resolve').mockResolvedValue(target); jest.spyOn(read, 'shared').mockResolvedValue([]);
  jest.spyOn(read, 'sharedMetadata').mockResolvedValue([]);
  const shared = jest.spyOn(read, 'sharedResource');
  jest.spyOn(read, 'branchExists').mockResolvedValue(true);
  jest.spyOn(read, 'files').mockResolvedValue([]);
  const variableWriter = { createMissing: jest.fn(async () => ({ created: 1, updated: 0, errors: [] as string[] })), upsert: jest.fn(async () => ({ created: 1, updated: 0, errors: [] as string[] })), upsertScopedVariables: jest.fn() };
  const resources = { labels: jest.fn(async () => undefined), issueTypes: jest.fn(async () => undefined) };
  const writer = new SetupBatchGithubApplyAdapter(read, variableWriter, resources);
  function pull() { return { number: 31, state: 'open', body: setupBatchMarker(operation, 7),
    head: { ref: setupBatchBranch(operation), sha: prepared, repo: { id: 7 } }, base: { ref: 'master' } }; }
  return { plan, writer, request, read, shared, variableWriter, resources, pull,
    setBranch: (sha: string | undefined) => { branch = sha; }, setPulls: (values: unknown[]) => { pulls = values; },
    setReceipt: (value: unknown) => { installation = value; } };
}
describe('installer-owned GitHub write boundaries', () => {
  it('revalidates an existing effective shared Variable and skips a redundant development-branch lookup', async () => {
    const f = fixture(); const resource = { kind: 'variable' as const, name: 'BUGBOT_COMMENT_LIMIT', value: '19', visibility: 'all' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [] };
    const plan = { ...f.plan, configuration: { ...f.plan.configuration, repository: { ...f.plan.configuration.repository, developmentBranch: 'master' } }, sharedSnapshot: [resource] };
    jest.mocked(f.read.sharedMetadata).mockResolvedValue([resource]);
    const effective = jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote, organizationVariables: [{ name: resource.name, value: resource.value }] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(true); expect(f.read.branchExists).not.toHaveBeenCalled();
    effective.mockResolvedValue({ ...f.plan.remote, organizationVariables: [] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    const grant = { kind: 'variable' as const, name: resource.name, repositoryId: 7 };
    expect(await f.writer.revalidate({ ...plan, grants: [grant] }, 'fixture', [])).toBe(true);
    expect(await f.writer.revalidate({ ...plan, grants: [grant] }, 'fixture', ['access'])).toBe(false);
  });
  it('adds only the reviewed Variable membership using the variable access endpoint', async () => {
    const f = fixture(); const resource = { kind: 'variable' as const, name: 'BUGBOT_COMMENT_LIMIT', value: '19', visibility: 'selected' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1] };
    const grant = { kind: 'variable' as const, name: resource.name, repositoryId: 7 };
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce({ ...resource, selectedRepositoryIds: [1, 7] });
    f.request.mockResolvedValue({ data: {} });
    await f.writer.grant({ ...f.plan, sharedSnapshot: [resource], grants: [grant] }, grant, 'fixture');
    expect(f.request).toHaveBeenCalledWith('PUT /orgs/{org}/actions/variables/{name}/repositories/{repository_id}', expect.objectContaining({ name: resource.name, repository_id: 7 }));
  });
  it('preserves an original grant error when readback cannot prove retained access', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 };
    f.shared.mockResolvedValue(resource); f.request.mockRejectedValue(new SetupBatchProviderError('forbidden'));
    await expect(f.writer.grant({ ...f.plan, sharedSnapshot: [resource], grants: [grant] }, grant, 'fixture')).rejects.toThrow('forbidden');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('rejects a reviewed grant without its reviewed resource snapshot before mutation', async () => {
    const f = fixture(); const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 };
    f.shared.mockResolvedValue({ kind: 'secret', name: 'PAT', visibility: 'selected', updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [] });
    await expect(f.writer.grant({ ...f.plan, grants: [grant] }, grant, 'fixture')).rejects.toThrow('unknown'); expect(f.request).not.toHaveBeenCalled();
  });
  it('does not recreate a repository Variable removed after review', async () => {
    const f = fixture(); const variable = { name: 'MODEL', value: 'reviewed' };
    await expect(f.writer.variables({ ...f.plan, repositoryVariables: [variable], remote: { ...f.plan.remote, repositoryVariables: [variable] } }, 'fixture')).rejects.toThrow('unknown');
    expect(f.variableWriter.createMissing).not.toHaveBeenCalled();
  });
  it('blocks preparation immediately when the reviewed repository moved', async () => {
    const f = fixture(); jest.mocked(f.read.resolve).mockResolvedValue({ ...f.plan.target, baseSha: 'f'.repeat(40) });
    await expect(f.writer.prepareCommit(f.plan, operation, 'fixture')).rejects.toThrow('unknown'); expect(f.request).not.toHaveBeenCalled();
  });
  it.each([true, false])('keeps a reviewed existing manifest and explicit file deletion: draft manifest=%s', async inDraft => {
    const f = fixture(); const manifest = { path: '.copilot/setup-manifest.json', content: JSON.stringify({ schemaVersion: 2, custom: 'retained' }) };
    jest.mocked(f.read.files).mockResolvedValue([manifest]);
    const plan = { ...f.plan, files: [...f.plan.files, { path: '.github/workflows/obsolete.yml', content: null }, ...(inDraft ? [manifest] : [])] };
    await f.writer.prepareCommit(plan, operation, 'fixture');
    const tree = f.request.mock.calls.find(([route]) => route === 'POST /repos/{owner}/{repo}/git/trees')![1].tree;
    expect(tree).toEqual(expect.arrayContaining([{ path: '.github/workflows/obsolete.yml', type: 'blob', mode: '100644', sha: null },
      expect.objectContaining({ path: manifest.path, content: expect.stringContaining('retained') })]));
    expect(f.read.files).toHaveBeenCalledTimes(inDraft ? 0 : 1);
  });
  it('refuses a non-object manifest or invalid operation receipt before any Git write', async () => {
    const f = fixture();
    await expect(f.writer.prepareCommit({ ...f.plan, files: [{ path: '.copilot/setup-manifest.json', content: 'null' }] }, operation, 'fixture')).rejects.toThrow('malformed');
    await expect(f.writer.prepareCommit(f.plan, 'invalid-operation', 'fixture')).rejects.toThrow('malformed');
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it('does not write a ref when the existing Git ref is malformed or unreadable', async () => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route.includes('git/ref/') ? Promise.resolve({ data: { object: { sha: 'HEAD' } } }) : original(route, parameters));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow('malformed');
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it('requires the exact prepared ref before even inspecting installation PRs', async () => {
    const f = fixture(); f.setBranch('f'.repeat(40));
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow('unknown');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('ignores unrelated PRs and old closed operations while keeping the exact existing PR', async () => {
    const f = fixture(); f.setBranch(prepared); f.setPulls([{ head: { ref: 'feature/unrelated' } },
      { state: 'closed', head: { ref: 'setup/copilot/old-operation' } }, f.pull()]);
    expect(await f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).toBe(31);
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it.each([{}, Array.from({ length: 101 }, () => ({})), undefined])('rejects malformed or ambiguous PR inventories before creation', async data => {
    const f = fixture(); f.setBranch(prepared); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route === 'GET /repos/{owner}/{repo}/pulls' ? Promise.resolve({ data: data ?? [f.pull(), f.pull()] }) : original(route, parameters));
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it('pauses after the fixed PR discovery cap instead of creating against an incomplete inventory', async () => {
    const f = fixture(); f.setBranch(prepared); f.setPulls(Array.from({ length: 100 }, () => ({ head: { ref: 'feature/other' } })));
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow('malformed');
    expect(f.request.mock.calls.filter(([route]) => route === 'GET /repos/{owner}/{repo}/pulls')).toHaveLength(10);
    expect(f.request.mock.calls.some(([route]) => route.startsWith('POST '))).toBe(false);
  });
  it('never sends an existing reviewed Variable to a replacement writer', async () => {
    const f = fixture(); const variable = { name: 'MODEL', value: 'original' };
    const plan = { ...f.plan, remote: { ...f.plan.remote, repositoryVariables: [variable] }, repositoryVariables: [{ name: 'MODEL', value: 'desired' }] };
    jest.spyOn(f.read, 'effective').mockResolvedValue(plan.remote);
    await expect(f.writer.variables(plan, 'fixture')).rejects.toThrow('unknown');
    expect(f.variableWriter.createMissing).not.toHaveBeenCalled(); expect(f.variableWriter.upsert).not.toHaveBeenCalled();
  });
  it('prepares a complete tree on the exact base and embeds a secret-free receipt before creating a ref', async () => {
    const f = fixture(); expect(await f.writer.prepareCommit(f.plan, operation, 'fixture-token')).toBe(prepared);
    const tree = f.request.mock.calls.find(([route]) => route === 'POST /repos/{owner}/{repo}/git/trees')![1];
    expect(tree.base_tree).toBe('d'.repeat(40));
    expect(tree.tree).toEqual(expect.arrayContaining([expect.objectContaining({ path: '.copilot/setup-manifest.json', content: expect.stringContaining('installation') })]));
    expect(JSON.stringify(tree)).not.toContain('fixture-token');
    expect(f.request).toHaveBeenCalledWith('POST /repos/{owner}/{repo}/git/commits', expect.objectContaining({ parents: [base] }));
    expect(f.request.mock.calls.some(([route]) => route.includes('git/refs'))).toBe(false);
  });
  it('adopts only the exact complete prepared commit after an uncertain ref create', async () => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, parameters) => { const result = await original(route, parameters);
      if (route === 'POST /repos/{owner}/{repo}/git/refs') throw new Error('lost response'); return result; });
    await f.writer.branch(f.plan, operation, prepared, 'fixture');
    expect(f.request.mock.calls.filter(([route]) => route === 'POST /repos/{owner}/{repo}/git/refs')).toHaveLength(1);
  });
  it('never overwrites a human-moved installation ref', async () => {
    const f = fixture(); f.setBranch('f'.repeat(40));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request.mock.calls.some(([route]) => !route.startsWith('GET '))).toBe(false);
  });
  it.each([{ schemaVersion: 2 }, { schemaVersion: 1, operationId: operation, repositoryId: 8, baseSha: base, planDigest: 'b'.repeat(64) }])('rejects a forged or future installation receipt %j', async receipt => {
    const f = fixture(); f.setReceipt(receipt);
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request.mock.calls.some(([route]) => !route.startsWith('GET '))).toBe(false);
  });
  it('inspects an uncertain PR response and reuses its exact marker without another creation', async () => {
    const f = fixture(); f.setBranch(prepared); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, parameters) => { const result = await original(route, parameters);
      if (route === 'POST /repos/{owner}/{repo}/pulls') throw new Error('lost response'); return result; });
    expect(await f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).toBe(31);
    expect(await f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).toBe(31);
    expect(f.request.mock.calls.filter(([route]) => route === 'POST /repos/{owner}/{repo}/pulls')).toHaveLength(1);
  });
  it('does not resurrect a manually closed setup PR', async () => {
    const f = fixture(); f.setBranch(prepared); f.setPulls([{ ...f.pull(), state: 'closed' }]);
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request.mock.calls.some(([route]) => !route.startsWith('GET '))).toBe(false);
  });
  it('surfaces another open installer PR instead of creating a duplicate operation', async () => {
    const f = fixture(); f.setBranch(prepared); f.setPulls([{ ...f.pull(), head: { ...f.pull().head,
      ref: 'setup/copilot/another-operation' } }]);
    await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow();
    expect(f.request.mock.calls.some(([route]) => !route.startsWith('GET '))).toBe(false);
  });
  it('writes only reviewed repository Variable differences and never a shared value', async () => {
    const f = fixture(); const plan = { ...f.plan, repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '19' }] };
    await f.writer.variables(plan, 'fixture');
    expect(f.variableWriter.createMissing).toHaveBeenCalledWith('acme', 'repo', 'fixture', plan.repositoryVariables);
    expect(f.variableWriter.upsertScopedVariables).not.toHaveBeenCalled();
  });
  it('preserves a concurrent repository Variable edit', async () => {
    const f = fixture(); jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote,
      repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: 'other' }] });
    await expect(f.writer.variables({ ...f.plan, repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '19' }] }, 'fixture')).rejects.toThrow();
    expect(f.variableWriter.upsert).not.toHaveBeenCalled();
  });
  it('adds one reviewed repository to a selected Secret and retains other memberships', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1, 2] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 };
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce({ ...resource, selectedRepositoryIds: [1, 2, 7, 9] });
    f.request.mockResolvedValueOnce({ data: {} });
    await f.writer.grant({ ...f.plan, grants: [grant], sharedSnapshot: [resource] }, grant, 'fixture');
    expect(f.request).toHaveBeenCalledWith('PUT /orgs/{org}/actions/secrets/{name}/repositories/{repository_id}',
      expect.objectContaining({ org: 'acme', name: 'PAT', repository_id: 7 }));
    expect(f.request.mock.calls).toHaveLength(1);
  });
  it('rejects an unreviewed grant before any provider call', async () => {
    const f = fixture();
    await expect(f.writer.grant(f.plan, { kind: 'secret', name: 'PAT', repositoryId: 8 }, 'fixture')).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
  });
  it.each(['repositoryVariablesAccess', 'repositorySecretsAccess', 'organizationVariablesAccess', 'organizationSecretsAccess'] as const)('blocks unavailable %s before any effect', async field => {
    const f = fixture(); jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote, [field]: 'unavailable' });
    expect(await f.writer.revalidate(f.plan, 'fixture', [])).toBe(false); expect(f.request).not.toHaveBeenCalled();
  });
  it('blocks deletion or inaccessible development branch before setup writes', async () => {
    const f = fixture(); jest.mocked(f.read.branchExists).mockResolvedValue(false);
    expect(await f.writer.revalidate(f.plan, 'fixture', [])).toBe(false); expect(f.request).not.toHaveBeenCalled();
  });
  it('blocks changed repository identity and missing or rotated shared bindings', async () => {
    const f = fixture(); const resolve = jest.mocked(f.read.resolve); resolve.mockResolvedValueOnce({ ...f.plan.target, id: 8 });
    expect(await f.writer.revalidate(f.plan, 'fixture', [])).toBe(false);
    const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'all' as const, updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [] };
    const plan = { ...f.plan, sharedSnapshot: [resource] }; const metadata = jest.mocked(f.read.sharedMetadata);
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    metadata.mockResolvedValueOnce([{ ...resource, updatedAt: '2026-10-17T14:01:00Z' }]);
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    metadata.mockResolvedValueOnce([resource]); jest.spyOn(f.read, 'effective').mockResolvedValue({ ...f.plan.remote, organizationSecrets: [] });
    expect(await f.writer.revalidate(plan, 'fixture', ['access'])).toBe(false);
  });
  it('accepts reviewed Variable results but stops a concurrent Secret or Variable change', async () => {
    const f = fixture(); const effective = jest.spyOn(f.read, 'effective');
    const plan = { ...f.plan, repositoryVariables: [{ name: 'MODEL', value: 'reviewed' }] };
    effective.mockResolvedValueOnce({ ...f.plan.remote, repositoryVariables: plan.repositoryVariables });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(true);
    effective.mockResolvedValueOnce({ ...f.plan.remote, repositoryVariables: [{ name: 'MODEL', value: 'human' }] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    effective.mockResolvedValueOnce({ ...f.plan.remote, repositorySecrets: ['PAT'] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false);
    expect(await f.writer.revalidate({ ...f.plan, remote: { ...f.plan.remote, repositoryVariables: [{ name: 'MODEL', value: 'original' }] } }, 'fixture', [])).toBe(false);
  });
  it('blocks a same-name repository Secret rotation before any setup effect', async () => {
    const f = fixture(); const original = { name: 'PAT', updatedAt: '2026-10-17T14:00:00Z' };
    const plan = { ...f.plan, remote: { ...f.plan.remote, repositorySecrets: ['PAT'], repositorySecretRevisions: [original] } };
    jest.spyOn(f.read, 'effective').mockResolvedValue({ ...plan.remote, repositorySecretRevisions: [{ ...original, updatedAt: '2026-10-17T14:01:00Z' }] });
    expect(await f.writer.revalidate(plan, 'fixture', [])).toBe(false); expect(f.request).not.toHaveBeenCalled();
  });
  it.each([undefined, [], [{ name: 'OTHER', updatedAt: '2026-10-17T14:00:00Z' }],
    [{ name: 'PAT', updatedAt: 'unknown' }]])('blocks missing or incomplete repository Secret revisions %j', async revisions => {
    const f = fixture(); const remote = { ...f.plan.remote, repositorySecrets: ['PAT'], repositorySecretRevisions: revisions };
    jest.spyOn(f.read, 'effective').mockResolvedValue(remote);
    expect(await f.writer.revalidate({ ...f.plan, remote }, 'fixture', [])).toBe(false); expect(f.request).not.toHaveBeenCalled();
  });
  it('requires complete reviewed and fresh revisions and ignores harmless ordering', async () => {
    const f = fixture(); const revisions = [{ name: 'PAT', updatedAt: '2026-10-17T14:00:00Z' },
      { name: 'OTHER', updatedAt: '2026-10-17T14:01:00Z' }];
    const remote = { ...f.plan.remote, repositorySecrets: ['PAT', 'OTHER'], repositorySecretRevisions: revisions };
    const effective = jest.spyOn(f.read, 'effective').mockResolvedValue({ ...remote,
      repositorySecrets: [...remote.repositorySecrets].reverse(), repositorySecretRevisions: [...revisions].reverse() });
    expect(await f.writer.revalidate({ ...f.plan, remote }, 'fixture', [])).toBe(true);
    expect(await f.writer.revalidate({ ...f.plan, remote: { ...remote, repositorySecretRevisions: undefined } }, 'fixture', [])).toBe(false);
    effective.mockResolvedValue({ ...remote, repositorySecretRevisions: undefined });
    expect(await f.writer.revalidate({ ...f.plan, remote }, 'fixture', [])).toBe(false);
  });
  it('skips an already written Variable and refuses unavailable or failed writes', async () => {
    const f = fixture(); const variable = { name: 'MODEL', value: 'reviewed' }; const plan = { ...f.plan, repositoryVariables: [variable] };
    const effective = jest.spyOn(f.read, 'effective'); effective.mockResolvedValueOnce({ ...f.plan.remote, repositoryVariables: [variable] });
    await f.writer.variables(plan, 'fixture'); expect(f.variableWriter.upsert).not.toHaveBeenCalled();
    effective.mockResolvedValueOnce({ ...f.plan.remote, repositoryVariablesAccess: 'unavailable' });
    await expect(f.writer.variables(plan, 'fixture')).rejects.toThrow('forbidden');
    effective.mockResolvedValue(f.plan.remote); f.variableWriter.createMissing.mockResolvedValue({ created: 0, updated: 0, errors: ['private'] });
    await expect(f.writer.variables(plan, 'fixture')).rejects.toThrow('unknown');
  });
  it('retains already granted access without an additional PUT', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const, updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1, 7] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 }; f.shared.mockResolvedValue(resource);
    await f.writer.grant({ ...f.plan, grants: [grant], sharedSnapshot: [resource] }, grant, 'fixture'); expect(f.request).not.toHaveBeenCalled();
  });
  it('does not remove another repository membership or accept changed visibility during a grant', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const, updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1, 2] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 }; const plan = { ...f.plan, grants: [grant], sharedSnapshot: [resource] };
    f.shared.mockResolvedValueOnce({ ...resource, visibility: 'all' });
    await expect(f.writer.grant(plan, grant, 'fixture')).rejects.toThrow(); expect(f.request).not.toHaveBeenCalled();
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce({ ...resource, selectedRepositoryIds: [7] }); f.request.mockResolvedValue({ data: {} });
    await expect(f.writer.grant(plan, grant, 'fixture')).rejects.toThrow('unknown');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('inspects an uncertain additive grant and accepts only effective retained access', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const, updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 }; const plan = { ...f.plan, grants: [grant], sharedSnapshot: [resource] };
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce({ ...resource, selectedRepositoryIds: [1, 7], updatedAt: '2026-10-17T14:01:00Z' });
    f.request.mockRejectedValue(new Error('response lost')); await f.writer.grant(plan, grant, 'fixture'); expect(f.request).toHaveBeenCalledTimes(1);
    jest.mocked(f.read.sharedMetadata).mockResolvedValue([{ ...resource, updatedAt: '2026-10-17T14:01:00Z' }]);
    expect(await f.writer.revalidate(plan, 'fixture', ['access'])).toBe(true);
  });
  it('resumes a completed grant with a new adapter and freshly reviewed metadata, while rejecting stale plans and later rotations', async () => {
    const f = fixture(); const resource = { kind: 'secret' as const, name: 'PAT', visibility: 'selected' as const,
      updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [1] };
    const grant = { kind: 'secret' as const, name: 'PAT', repositoryId: 7 };
    const originalPlan = { ...f.plan, grants: [grant], sharedSnapshot: [resource] };
    const observed = { ...resource, updatedAt: '2026-10-17T14:01:00Z', selectedRepositoryIds: [1, 7] };
    f.shared.mockResolvedValueOnce(resource).mockResolvedValueOnce(observed);
    f.request.mockResolvedValue({ data: {} });
    await f.writer.grant(originalPlan, grant, 'fixture');
    const restarted = new SetupBatchGithubApplyAdapter(f.read, f.variableWriter, f.resources);
    const metadata = jest.mocked(f.read.sharedMetadata).mockResolvedValue([observed]);
    expect(await restarted.revalidate(originalPlan, 'fixture', ['access'])).toBe(false);
    const freshPlan = { ...originalPlan, grants: [], sharedSnapshot: [observed] };
    expect(await restarted.revalidate(freshPlan, 'fixture', ['access'])).toBe(true);
    metadata.mockResolvedValue([{ ...observed, updatedAt: '2026-10-17T14:02:00Z' }]);
    expect(await restarted.revalidate(freshPlan, 'fixture', ['access'])).toBe(false);
    expect(f.request.mock.calls.filter(([route]) => route.startsWith('PUT '))).toHaveLength(1);
  });
  it.each([{ route: 'POST /repos/{owner}/{repo}/git/trees', data: { sha: 'HEAD' } },
    { route: 'POST /repos/{owner}/{repo}/git/commits', data: { sha: 'HEAD' } },
    { route: 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}', data: { tree: {} } }])('rejects malformed Git object identities at $route', async ({ route: failed, data }) => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route === failed ? Promise.resolve({ data }) : original(route, parameters));
    await expect(f.writer.prepareCommit(f.plan, operation, 'fixture')).rejects.toThrow('malformed');
    expect(f.request.mock.calls.some(([route]) => route.includes('git/refs'))).toBe(false);
  });
  it('refuses incomplete parents, malformed manifest encoding and invalid prepared commits', async () => {
    const f = fixture(); await expect(f.writer.branch(f.plan, operation, 'HEAD', 'fixture')).rejects.toThrow('malformed');
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route.includes('git/commits') ? Promise.resolve({ data: { parents: [] } }) : original(route, parameters));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow('unknown');
    f.request.mockImplementation((route, parameters) => route.includes('/contents/') ? Promise.resolve({ data: { encoding: 'raw', content: '{}' } }) : original(route, parameters));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow('malformed');
  });
  it('refuses to claim an unconfirmed branch or PR creation as success', async () => {
    const f = fixture(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, parameters) => route.startsWith('POST ') ? Promise.resolve({ data: {} }) : original(route, parameters));
    await expect(f.writer.branch(f.plan, operation, prepared, 'fixture')).rejects.toThrow('unknown');
    f.setBranch(prepared); await expect(f.writer.pullRequest(f.plan, operation, prepared, 'fixture')).rejects.toThrow('unknown');
    expect(f.request.mock.calls.filter(([route]) => route === 'POST /repos/{owner}/{repo}/pulls')).toHaveLength(1);
  });

});
