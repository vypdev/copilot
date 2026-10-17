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
