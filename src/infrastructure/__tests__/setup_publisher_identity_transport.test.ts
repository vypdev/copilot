import { SetupBatchGithubTransport } from '../setup_batch_github_read_adapter';
import type { GithubSetupBatchClient } from '../github/ports/github_setup_batch_protocol';

function fixture() {
  const request = jest.fn<ReturnType<GithubSetupBatchClient['request']>, Parameters<GithubSetupBatchClient['request']>>();
  const getClient = jest.fn((_token: string) => ({ request }));
  return { request, getClient, transport: new SetupBatchGithubTransport({ getClient }) };
}
it('reads actual authenticated identity and granted scope metadata through the existing bounded transport', async () => {
  const f = fixture(); f.request.mockResolvedValue({ data: { id: 7 }, headers: { 'x-oauth-scopes': 'workflow, repo, repo:status, repo' } });
  const result = await f.transport.identity('private-fixture-token');
  expect(result).toEqual({ user: { id: 7 }, oauthScopes: ['repo', 'repo:status', 'workflow'] }); expect(Object.isFrozen(result.oauthScopes)).toBe(true);
  expect(f.getClient).toHaveBeenCalledWith('private-fixture-token');
  expect(f.request).toHaveBeenCalledWith('GET /user', { request: { timeout: 15_000, signal: expect.any(AbortSignal) } });
});
it('endpoint-required permissions are never treated as actual granted capabilities', async () => {
  const f = fixture(); f.request.mockResolvedValue({ data: { id: 7 }, headers: { 'x-accepted-github-permissions': 'contents=write,pull_requests=write,workflows=write' } });
  expect((await f.transport.identity('fixture')).oauthScopes).toBeNull();
});
it('an older data-only client response leaves authorization metadata unknown', async () => {
  const f = fixture(); f.request.mockResolvedValue({ data: { id: 7 } });
  expect(await f.transport.identity('fixture')).toEqual({ user: { id: 7 }, oauthScopes: null });
});
it.each([undefined, '', [], {}, 'repo,', 'Repo, workflow', 'repo\nworkflow', 'repo\u202e, workflow', 'x'.repeat(4097), Array(65).fill('repo').join(',')])(
  'keeps absent or malformed scope metadata unknown rather than inventing a write grant', async scope => {
    const f = fixture(); f.request.mockResolvedValue({ data: { id: 7 }, headers: { 'x-oauth-scopes': scope } });
    expect((await f.transport.identity('fixture')).oauthScopes).toBeNull();
  },
);
it('legacy data-only requests do not acquire a new header-shaped public result', async () => {
  const f = fixture(); f.request.mockResolvedValue({ data: ['retained'], headers: { 'x-oauth-scopes': 'repo' } });
  expect(await f.transport.call('fixture', 'GET /fixed', {})).toEqual(['retained']);
});
it('identity reads retain the existing bounded transient retries without issuing a write probe', async () => {
  const f = fixture(); f.request.mockRejectedValueOnce({ status: 503 }).mockResolvedValue({ data: { id: 7 }, headers: { 'x-oauth-scopes': 'repo,workflow' } });
  expect((await f.transport.identity('fixture')).oauthScopes).toEqual(['repo', 'workflow']);
  expect(f.request).toHaveBeenCalledTimes(2); expect(f.request.mock.calls.every(([route]) => route === 'GET /user')).toBe(true);
});
it('an unusable rate-limit delay never starts a guessed or unbounded authorization retry', async () => {
  const f = fixture(); f.request.mockRejectedValue({ status: 429, response: { headers: { 'retry-after': 'unusable' } } });
  await expect(f.transport.identity('fixture')).rejects.toMatchObject({ code: 'rate-limited' }); expect(f.request).toHaveBeenCalledTimes(1);
});
