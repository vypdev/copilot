import { PullRequestLifecycleRepository } from '../pull_request/pull_request_lifecycle_repository';
const sha = 'a'.repeat(40), live = 'b'.repeat(40), head = 'c'.repeat(40);
function setup() {
    const data = { number: 7, state: 'open', draft: false, changed_files: 887,
        base: { ref: 'develop', sha, repo: { id: 42, name: 'repo', owner: { login: 'owner' } } },
        head: { ref: 'feature', sha: head, repo: { name: 'repo', owner: { login: 'owner' } } } };
    const get = jest.fn(async () => ({ data }));
    const getRef = jest.fn(async () => ({ data: { ref: 'refs/heads/develop', object: { sha: live, type: 'commit' } } }));
    const repository = new PullRequestLifecycleRepository({ getClient: () => ({ rest: { pulls: { get }, git: { getRef } } }) } as any);
    return { data, get, getRef, repository };
}
it('distinguishes the live target branch tip from an earlier cached PR base SHA', async () => {
    const f = setup();
    const identity = await f.repository.getBugbotSourceBoundPullRequestIdentity('owner', 'repo', 7, 'private-credential');
    expect(identity).toMatchObject({ baseSha: sha, baseRefSha: live, baseRef: 'develop', headSha: head, changedFileCount: 887 });
    expect(f.getRef).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', ref: 'heads/develop' });
    expect(JSON.stringify(identity)).not.toContain('private-credential');
});
it('retains the single existing provider read for an ordinary PR identity query', async () => {
    const f = setup(); await f.repository.getBugbotPullRequestIdentity('owner', 'repo', 7, 'credential');
    expect(f.get).toHaveBeenCalledTimes(1); expect(f.getRef).not.toHaveBeenCalled();
});
it.each([
    { ref: 'refs/heads/foreign', object: { sha: live, type: 'commit' } },
    { ref: 'refs/heads/develop', object: { sha: live, type: 'tag' } },
    { ref: 'refs/heads/develop', object: { sha: '0'.repeat(40), type: 'commit' } },
    { ref: 'refs/heads/develop', object: { sha: 'bad', type: 'commit' } },
    { ref: 'refs/heads/develop' },
])('rejects unverified target branch facts %j', async data => {
    const f = setup(); f.getRef.mockResolvedValueOnce({ data } as any);
    await expect(f.repository.getBugbotSourceBoundPullRequestIdentity('owner', 'repo', 7, 'credential')).rejects.toMatchObject({ code: 'provider.contract-invalid' });
});
it('does not treat a failed target ref query as the old cached base SHA', async () => {
    const f = setup(); f.getRef.mockRejectedValueOnce(new Error('temporary network failure'));
    await expect(f.repository.getBugbotSourceBoundPullRequestIdentity('owner', 'repo', 7, 'credential')).rejects.toThrow('temporary network failure');
});

it('rejects a missing target ref before querying any guessed Git ref', async () => {
    const f = setup(); f.data.base.ref = '';
    await expect(f.repository.getBugbotSourceBoundPullRequestIdentity('owner', 'repo', 7, 'credential')).rejects.toMatchObject({ code: 'provider.contract-invalid' });
    expect(f.getRef).not.toHaveBeenCalled();
});
it('reports an unavailable live-ref capability instead of accepting cached comparison metadata', async () => {
    const f = setup(); const repository = new PullRequestLifecycleRepository({ getClient: () => ({ rest: { pulls: { get: f.get } } }) } as any);
    await expect(repository.getBugbotSourceBoundPullRequestIdentity('owner', 'repo', 7, 'credential')).rejects.toMatchObject({ code: 'configuration.unsupported' });
});
