import { SetupBatchGithubReadAdapter, SetupBatchGithubTransport, SetupBatchProviderError } from '../setup_batch_github_read_adapter';
import type { SetupBatchTarget } from '../../domain/setup_batch';
const sha = 'a'.repeat(40);
const repository = (id = 7) => ({ id, name: `repo-${id}`, owner: { id: 3, login: 'acme', type: 'Organization' },
  default_branch: 'master', private: true, archived: false, disabled: false, permissions: { push: true } });
function fixture() {
  const request = jest.fn<Promise<{ data: unknown }>, [string, Record<string, unknown>]>();
  const remote = { inspect: jest.fn() };
  const transport = new SetupBatchGithubTransport({ getClient: () => ({ request }) });
  const adapter = new SetupBatchGithubReadAdapter(transport, remote);
  const target: SetupBatchTarget = { id: 7, ownerId: 3, owner: 'acme', name: 'repo-7', defaultBranch: 'master', baseSha: sha,
    private: true, archived: false, disabled: false, canPush: true };
  return { request, remote, adapter, target, transport };
}
describe('bounded GitHub setup discovery and namespace inspection', () => {
  it('uses the bounded default backoff clock after an explicit GitHub rate limit', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture(); f.request.mockRejectedValueOnce({ status: 429, response: { headers: { 'retry-after': '1' } } }).mockResolvedValueOnce({ data: [] });
      const result = f.adapter.list('acme', 'fixture');
      await jest.advanceTimersByTimeAsync(1000);
      expect(await result).toEqual({ targets: [], truncated: false });
      expect(f.request).toHaveBeenCalledTimes(2); expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
  it('returns deterministic asset order independent of GitHub tree order', async () => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: { truncated: false, tree: ['AGENTS.md', '.copilot/AGENT_GUIDE.md'].map(path => ({ path, type: 'blob', mode: '100644', sha, size: 1 })) } })
      .mockResolvedValue({ data: { encoding: 'base64', content: Buffer.from('a').toString('base64') } });
    expect((await f.adapter.files(f.target, 'fixture')).map(file => file.path)).toEqual(['.copilot/AGENT_GUIDE.md', 'AGENTS.md']);
    expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  });
  it('admits the exact 1,000-item inventory ceiling in at most 34 requests', async () => {
    const f = fixture();
    f.request.mockImplementation(async (_route, parameters) => ({ data: { total_count: 1000,
      variables: Array.from({ length: Number(parameters.page) === 34 ? 10 : 30 }, (_, i) => ({ name: `V_${(Number(parameters.page) - 1) * 30 + i}` })) } }));
    expect(await f.adapter.collection('fixture', 'GET /fixed', {}, 'variables')).toHaveLength(1000);
    expect(f.request).toHaveBeenCalledTimes(34);
    expect(f.request).toHaveBeenLastCalledWith('GET /fixed', expect.objectContaining({ page: 34, per_page: 30 }));
  });
  it('inspects selected repository access for a Variable without replacing the membership set', async () => {
    const f = fixture();
    f.request.mockResolvedValueOnce({ data: { name: 'BUGBOT_COMMENT_LIMIT', value: '20', visibility: 'selected', updated_at: '2026-10-17T14:00:00Z' } })
      .mockResolvedValueOnce({ data: { total_count: 1, repositories: [{ id: 7 }] } });
    expect(await f.adapter.sharedResource('acme', 'variable', 'BUGBOT_COMMENT_LIMIT', 'fixture')).toMatchObject({ selectedRepositoryIds: [7] });
    expect(f.request).toHaveBeenLastCalledWith('GET /orgs/{org}/actions/variables/{name}/repositories', expect.objectContaining({ name: 'BUGBOT_COMMENT_LIMIT' }));
    expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  });
  it('aborts each stalled read and stops after the bounded third attempt', async () => {
    jest.useFakeTimers();
    try {
      const f = fixture(); f.request.mockImplementation(() => new Promise(() => undefined));
      const result = expect(f.transport.call('fixture', 'GET /fixed', {})).rejects.toThrow('transient');
      await jest.advanceTimersByTimeAsync(45_000); await result;
      expect(f.request).toHaveBeenCalledTimes(3);
      expect(f.request.mock.calls.every(([, parameters]) => (parameters.request as { signal: AbortSignal }).signal.aborted)).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
  it.each([{}, Array.from({ length: 101 }, () => repository())])('rejects malformed or oversized repository pages', async data => {
    const f = fixture(); f.request.mockResolvedValue({ data });
    await expect(f.adapter.list('acme', 'fixture')).rejects.toThrow('malformed'); expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('accepts an authenticated admin capability without assuming push is present', async () => {
    const f = fixture(); f.request.mockResolvedValue({ data: [{ ...repository(), permissions: { admin: true } }] });
    expect((await f.adapter.list('acme', 'fixture')).targets[0].canPush).toBe(true);
  });
  it('blocks an unresolved immutable default-branch identity', async () => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: repository() }).mockResolvedValueOnce({ data: { object: { sha: 'HEAD' } } });
    await expect(f.adapter.resolve('acme', 'repo-7', 'fixture')).rejects.toThrow('malformed');
  });
  it('rejects duplicate managed metadata instead of choosing an arbitrary binding', async () => {
    const f = fixture(); const item = { name: 'BUGBOT_COMMENT_LIMIT', value: '19', visibility: 'all', updated_at: '2026-10-17T14:00:00Z' };
    f.request.mockResolvedValue({ data: { total_count: 2, variables: [item, item] } });
    await expect(f.adapter.shared('acme', 'fixture')).rejects.toThrow('malformed');
  });
  it.each(['variable', 'secret'] as const)('reads an exact %s binding and only its selected membership', async kind => {
    const f = fixture(); const name = kind === 'variable' ? 'BUGBOT_COMMENT_LIMIT' : 'PAT';
    f.request.mockResolvedValueOnce({ data: { name, value: '19', visibility: kind === 'variable' ? 'all' : 'selected', updated_at: '2026-10-17T14:00:00Z' } })
      .mockResolvedValueOnce({ data: { total_count: 1, repositories: [{ id: 7 }] } });
    expect(await f.adapter.sharedResource('acme', kind, name, 'fixture')).toMatchObject({ kind, name, selectedRepositoryIds: kind === 'secret' ? [7] : [] });
    expect(f.request).toHaveBeenCalledTimes(kind === 'secret' ? 2 : 1);
  });
  it('blocks an exact resource endpoint returning another name', async () => {
    const f = fixture(); f.request.mockResolvedValue({ data: { name: 'OTHER', visibility: 'all', updated_at: '2026-10-17T14:00:00Z' } });
    await expect(f.adapter.sharedResource('acme', 'secret', 'PAT', 'fixture')).rejects.toThrow('malformed');
  });
  it.each([{ repositories: [{ id: 7 }, { id: 7 }] }, { repositories: [{ id: 0 }] }])('rejects ambiguous or invalid selected repository identities', async ({ repositories }) => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: { name: 'PAT', visibility: 'selected', updated_at: '2026-10-17T14:00:00Z' } })
      .mockResolvedValueOnce({ data: { total_count: repositories.length, repositories } });
    await expect(f.adapter.sharedResource('acme', 'secret', 'PAT', 'fixture')).rejects.toThrow('malformed');
  });
  it('blocks collection total changes between pages before trusting incomplete access', async () => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: { total_count: 31, secrets: Array.from({ length: 30 }, () => ({})) } })
      .mockResolvedValueOnce({ data: { total_count: 32, secrets: [{}] } });
    await expect(f.adapter.collection('fixture', 'GET /fixed', {}, 'secrets')).rejects.toThrow('malformed');
    expect(f.request).toHaveBeenCalledTimes(2);
  });
  it.each([
    { encoding: 'raw', content: 'a' }, { encoding: 'base64', content: 'x'.repeat(140_001) },
    { encoding: 'base64', content: Buffer.from('too long').toString('base64') },
    { encoding: 'base64', content: Buffer.from([255]).toString('base64') },
  ])('rejects invalid blob content before rendering or writing', async blob => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: { truncated: false, tree: [{ path: 'AGENTS.md', type: 'blob', mode: '100644', sha, size: 1 }] } })
      .mockResolvedValueOnce({ data: blob });
    await expect(f.adapter.files(f.target, 'fixture')).rejects.toThrow('malformed');
    expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  });
  it('blocks duplicate tree paths instead of choosing one blob', async () => {
    const f = fixture(); const entry = { path: 'AGENTS.md', type: 'blob', mode: '100644', sha, size: 1 };
    f.request.mockResolvedValueOnce({ data: { truncated: false, tree: [entry, entry] } })
      .mockResolvedValue({ data: { encoding: 'base64', content: Buffer.from('a').toString('base64') } });
    await expect(f.adapter.files(f.target, 'fixture')).rejects.toThrow('malformed');
  });
  it('blocks more than 300 admitted assets before fetching any blob', async () => {
    const f = fixture(); f.request.mockResolvedValue({ data: { truncated: false, tree: Array.from({ length: 301 }, (_, i) => ({
      path: `.github/workflows/job-${i}.yml`, type: 'blob', mode: '100644', sha, size: 0 })) } });
    await expect(f.adapter.files(f.target, 'fixture')).rejects.toThrow('malformed'); expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('stops the cumulative asset budget before downloading the next oversized total', async () => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: { truncated: false, tree: Array.from({ length: 21 }, (_, i) => ({
      path: `.github/workflows/job-${i}.yml`, type: 'blob', mode: '100644', sha, size: 100_000 })) } })
      .mockResolvedValue({ data: { encoding: 'base64', content: Buffer.from('a'.repeat(100_000)).toString('base64') } });
    await expect(f.adapter.files(f.target, 'fixture')).rejects.toThrow('malformed'); expect(f.request).toHaveBeenCalledTimes(21);
  });
  it('resolves authenticated default branch identity and an immutable base', async () => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: repository() }).mockResolvedValueOnce({ data: { object: { sha } } });
    expect(await f.adapter.resolve('acme', 'repo-7', 'fixture')).toEqual(f.target);
    expect(f.request).toHaveBeenLastCalledWith('GET /repos/{owner}/{repo}/git/ref/{ref}', expect.objectContaining({ ref: 'heads/master' }));
  });
  it.each([{ status: 404, expected: false }, { status: 403, expected: undefined }])('keeps missing and forbidden development branches distinct: $status', async ({ status, expected }) => {
    const f = fixture(); f.request.mockRejectedValue({ status });
    expect(await f.adapter.branchExists(f.target, 'develop', 'fixture')).toBe(expected);
  });
  it('establishes branch existence only from an immutable commit identity', async () => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: { object: { sha } } }).mockResolvedValueOnce({ data: {} });
    expect(await f.adapter.branchExists(f.target, 'develop', 'fixture')).toBe(true);
    expect(await f.adapter.branchExists(f.target, 'develop', 'fixture')).toBeUndefined();
  });
  it('rejects cross-organization metadata before looking up a ref', async () => {
    const f = fixture(); f.request.mockResolvedValue({ data: { ...repository(), owner: { id: 4, login: 'other', type: 'Organization' } } });
    await expect(f.adapter.resolve('acme', 'repo-7', 'fixture')).rejects.toThrow('malformed');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('paginates the credential-limited discovery view without inventing commit SHAs', async () => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => repository(i + 1)) })
      .mockResolvedValueOnce({ data: [repository(101)] });
    const result = await f.adapter.list('acme', 'fixture');
    expect(result.targets).toHaveLength(101); expect(result.truncated).toBe(false);
    expect(result.targets[0]).not.toHaveProperty('baseSha');
    expect(f.request.mock.calls.map(([, parameters]) => parameters.page)).toEqual([1, 2]);
  });
  it('discloses the fixed discovery cap instead of claiming all repositories were found', async () => {
    const f = fixture(); f.request.mockImplementation(async (_route, parameters) => ({ data: Array.from({ length: 100 }, (_, i) => repository(Number(parameters.page) * 100 + i)) }));
    const result = await f.adapter.list('acme', 'fixture');
    expect(result.targets).toHaveLength(1000); expect(result.truncated).toBe(true); expect(f.request).toHaveBeenCalledTimes(10);
  });
  it('keeps only managed namespace metadata and never copies an unexpected Secret value', async () => {
    const f = fixture();
    f.request.mockResolvedValueOnce({ data: { total_count: 2, variables: [
      { name: 'BUGBOT_COMMENT_LIMIT', value: '19', visibility: 'all', updated_at: '2026-10-17T14:00:00Z' },
      { name: '_UNRELATED', value: 'unrelated', visibility: 'selected', updated_at: '2026-10-17T14:00:00Z' },
    ] } }).mockResolvedValueOnce({ data: { total_count: 1, secrets: [
      { name: 'PAT', value: 'must-never-cross-boundary', visibility: 'selected', updated_at: '2026-10-17T14:00:00Z' },
    ] } }).mockResolvedValueOnce({ data: { total_count: 2, repositories: [{ id: 7 }, { id: 9 }] } });
    const result = await f.adapter.shared('acme', 'fixture');
    expect(result).toEqual(expect.arrayContaining([
      { kind: 'variable', name: 'BUGBOT_COMMENT_LIMIT', value: '19', visibility: 'all', updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [] },
      { kind: 'secret', name: 'PAT', visibility: 'selected', updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [7, 9] },
    ]));
    expect(JSON.stringify(result)).not.toContain('must-never'); expect(JSON.stringify(result)).not.toContain('unrelated');
    expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  });
  it('keeps an oversized managed Variable unavailable instead of pretending it is absent', async () => {
    const f = fixture(); f.request.mockResolvedValueOnce({ data: { total_count: 1, variables: [
      { name: 'BUGBOT_ORGANIZATION_RULES', value: 'x'.repeat(30_001), visibility: 'all', updated_at: '2026-10-17T14:00:00Z' },
    ] } }).mockResolvedValueOnce({ data: { total_count: 0, secrets: [] } });
    await expect(f.adapter.shared('acme', 'fixture')).rejects.toThrow('malformed');
  });
  it.each([{ total_count: 2, secrets: [] }, { secrets: [] }, { total_count: 1001, secrets: [] }])('keeps incomplete namespace inventory unknown %j', async data => {
    const f = fixture(); f.request.mockResolvedValue({ data });
    await expect(f.adapter.collection('fixture', 'GET /fixed', {}, 'secrets')).rejects.toThrow('malformed');
  });
  it('does not reinterpret forbidden namespace access as empty', async () => {
    const f = fixture(); f.request.mockRejectedValue({ status: 403, message: 'private provider prose' });
    await expect(f.adapter.shared('acme', 'fixture')).rejects.toThrow('forbidden');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it.each([{ status: 429 }, { status: 403, response: { headers: { 'x-ratelimit-remaining': '0' } } },
    { status: 403, response: { headers: { 'retry-after': '60' } } }])('reports rate limits without retry storms %j', async error => {
    const f = fixture(); f.request.mockRejectedValue(error);
    await expect(f.transport.call('fixture', 'GET /fixed', {})).rejects.toThrow('rate-limited'); expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('retries transient reads at most three times and never retries a mutation', async () => {
    const f = fixture(); f.request.mockRejectedValue({ status: 503 });
    await expect(f.transport.call('fixture', 'GET /fixed', {})).rejects.toBeInstanceOf(SetupBatchProviderError);
    expect(f.request).toHaveBeenCalledTimes(3); f.request.mockClear();
    await expect(f.transport.call('fixture', 'POST /fixed', {})).rejects.toThrow('transient');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('waits for a provider-directed read retry and does not retry the same mutation', async () => {
    const f = fixture(); const clock = { now: () => 0, wait: jest.fn(async () => undefined) };
    const transport = new SetupBatchGithubTransport({ getClient: () => ({ request: f.request }) }, clock);
    const limited = { status: 429, response: { headers: { 'retry-after': '2' } } };
    f.request.mockRejectedValueOnce(limited).mockResolvedValueOnce({ data: 'read result' });
    expect(await transport.call('fixture', 'GET /fixed', {})).toBe('read result');
    expect(clock.wait).toHaveBeenCalledWith(2000); expect(f.request).toHaveBeenCalledTimes(2);
    f.request.mockClear().mockRejectedValue(limited); clock.wait.mockClear();
    await expect(transport.call('fixture', 'PUT /fixed', {})).rejects.toThrow('rate-limited');
    expect(f.request).toHaveBeenCalledTimes(1); expect(clock.wait).not.toHaveBeenCalled();
  });
  it('limits persistent 403 rate-limit responses to three reads and two waits', async () => {
    const f = fixture(); const clock = { now: () => 0, wait: jest.fn(async () => undefined) };
    const transport = new SetupBatchGithubTransport({ getClient: () => ({ request: f.request }) }, clock);
    f.request.mockRejectedValue({ status: 403, response: { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '15' } } });
    await expect(transport.call('fixture', 'GET /fixed', {})).rejects.toThrow('rate-limited');
    expect(f.request).toHaveBeenCalledTimes(3); expect(clock.wait.mock.calls).toHaveLength(2);
    expect(clock.wait).toHaveBeenNthCalledWith(1, 15000); expect(clock.wait).toHaveBeenNthCalledWith(2, 15000);
  });
  it('reads only regular allowlisted assets at the reviewed immutable tree and blob identities', async () => {
    const f = fixture(); const content = 'existing guide';
    f.request.mockResolvedValueOnce({ data: { truncated: false, tree: [
      { path: 'AGENTS.md', type: 'blob', mode: '100644', sha: 'b'.repeat(40), size: Buffer.byteLength(content) },
      { path: '.copilot/setup-backups/old', type: 'tree', mode: '040000', sha },
      { path: 'src/private.ts', type: 'blob', mode: '100644', sha, size: 99 },
    ] } }).mockResolvedValueOnce({ data: { encoding: 'base64', content: Buffer.from(content).toString('base64') } });
    expect(await f.adapter.files(f.target, 'fixture')).toEqual([{ path: 'AGENTS.md', content }]);
    expect(f.request.mock.calls[0][1].tree_sha).toBe(sha);
    expect(f.request.mock.calls[1][1].file_sha).toBe('b'.repeat(40));
    expect(f.request).toHaveBeenCalledTimes(2);
  });
  it.each(['120000', '160000'])('blocks symlink or submodule setup paths with mode %s', async mode => {
    const f = fixture(); f.request.mockResolvedValue({ data: { truncated: false,
      tree: [{ path: 'AGENTS.md', type: 'blob', mode, sha, size: 1 }] } });
    await expect(f.adapter.files(f.target, 'fixture')).rejects.toThrow('malformed');
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it('blocks a truncated tree rather than losing unseen repository files', async () => {
    const f = fixture(); f.request.mockResolvedValue({ data: { truncated: true, tree: [] } });
    await expect(f.adapter.files(f.target, 'fixture')).rejects.toThrow('malformed');
  });
});
