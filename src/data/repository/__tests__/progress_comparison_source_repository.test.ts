import { ProgressComparisonSourceRepository } from '../progress_comparison_source_repository';
import type { GithubProgressPullRequest } from '../../../infrastructure/github/ports/github_progress_comparison_provider_port';
const HEAD = 'a'.repeat(40), branch = 'chore/727-maintenance';
const pull = (): GithubProgressPullRequest => ({ number: 172, state: 'open', head: { sha: HEAD, ref: branch, repo: { name: 'repo', owner: { login: 'owner' } } }, base: { ref: 'master', repo: { name: 'repo', owner: { login: 'owner' } } } });
function fixture() {
    const candidate = pull(), fresh = pull();
    const list = jest.fn(async () => ({ data: [candidate] })), get = jest.fn(async () => ({ data: fresh }));
    const getClient = jest.fn(() => ({ rest: { pulls: { list, get } } }));
    const repo = new ProgressComparisonSourceRepository({ getClient });
    return { candidate, fresh, list, get, getClient, read: (ref = branch) => repo.getSource('owner', 'repo', ref, 'PRIVATE_TOKEN') };
}
describe('bounded native PR ownership', () => {
    it('uses exact native head filter, one authoritative get and the bound credential', async () => {
        const f = fixture(); expect(await f.read()).toEqual({ kind: 'pull-request', number: 172, headSha: HEAD, baseBranch: 'master' });
        expect(f.getClient).toHaveBeenCalledWith('PRIVATE_TOKEN'); expect(f.list).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', state: 'open', head: `owner:${branch}`, per_page: 2, page: 1 }); expect(f.get).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', pull_number: 172 });
    });
    it('uses a fresh source head rather than stale list metadata', async () => { const f = fixture(); f.candidate.head!.sha = 'b'.repeat(40); expect(await f.read()).toMatchObject({ headSha: HEAD }); });
    it('does not use a historical PR base.sha as the native branch head', async () => { const f = fixture(); Object.assign(f.fresh.base!, { sha: 'b'.repeat(40), html_url: 'PRIVATE_URL' }); expect(await f.read()).toEqual({ kind: 'pull-request', number: 172, headSha: HEAD, baseBranch: 'master' }); });
    it('accepts case-insensitive repository identity while preserving the branch name', async () => { const f = fixture(); for (const p of [f.candidate,f.fresh]) { p.head!.repo!.name = 'REPO'; p.base!.repo!.owner!.login = 'OWNER'; } expect((await f.read()).kind).toBe('pull-request'); });
    it('proves absence without a get or guessed target', async () => { const f = fixture(); f.list.mockResolvedValue({ data: [] }); expect(await f.read()).toEqual({ kind: 'none' }); expect(f.get).not.toHaveBeenCalled(); });
    it('caps ambiguous candidates at two without following either target', async () => { const f = fixture(); f.list.mockResolvedValue({ data: [pull(), { ...pull(), number: 173 }] }); expect(await f.read()).toEqual({ kind: 'ambiguous' }); expect(f.get).not.toHaveBeenCalled(); });
    it.each([null, undefined, {}, [pull(),pull(),pull()]])('rejects malformed or unbounded native list %#', data => { const f = fixture(); f.list.mockResolvedValue({ data } as never); return expect(f.read()).rejects.toMatchObject({ code: 'workflow.stale' }); });
    it.each(['head owner','head name','base owner','base name','missing head repo','missing base repo','wrong ref','closed','zero number','fractional number','missing number','null candidate'])('rejects list identity: %s', async scenario => {
        const f = fixture();
        if (scenario === 'head owner') f.candidate.head!.repo!.owner!.login = 'foreign';
        if (scenario === 'head name') f.candidate.head!.repo!.name = 'fork';
        if (scenario === 'base owner') f.candidate.base!.repo!.owner!.login = 'foreign';
        if (scenario === 'base name') f.candidate.base!.repo!.name = 'other';
        if (scenario === 'missing head repo') f.candidate.head!.repo = null;
        if (scenario === 'missing base repo') f.candidate.base!.repo = null;
        if (scenario === 'wrong ref') f.candidate.head!.ref = 'other';
        if (scenario === 'closed') f.candidate.state = 'closed';
        if (scenario === 'zero number') f.candidate.number = 0;
        if (scenario === 'fractional number') f.candidate.number = 1.5;
        if (scenario === 'missing number') delete f.candidate.number;
        if (scenario === 'null candidate') f.list.mockResolvedValue({ data: [null] } as never);
        await expect(f.read()).rejects.toMatchObject({ code: 'workflow.stale' }); expect(f.get).not.toHaveBeenCalled();
    });
    it.each(['head owner','head name','base owner','base name','no head owner','no head name','no base owner','no base name','no head','no base','wrong number','closed','wrong ref','short SHA','uppercase SHA','missing SHA','bad base ref','self target','missing response'])('rejects authoritative identity: %s', async scenario => {
        const f = fixture(), p = f.fresh;
        if (scenario === 'head owner') p.head!.repo!.owner!.login = 'foreign';
        if (scenario === 'head name') p.head!.repo!.name = 'fork';
        if (scenario === 'base owner') p.base!.repo!.owner!.login = 'foreign';
        if (scenario === 'base name') p.base!.repo!.name = 'elsewhere';
        if (scenario === 'no head owner') delete p.head!.repo!.owner;
        if (scenario === 'no head name') delete p.head!.repo!.name;
        if (scenario === 'no base owner') delete p.base!.repo!.owner;
        if (scenario === 'no base name') delete p.base!.repo!.name;
        if (scenario === 'no head') delete p.head;
        if (scenario === 'no base') delete p.base;
        if (scenario === 'wrong number') p.number = 999;
        if (scenario === 'closed') p.state = 'closed';
        if (scenario === 'wrong ref') p.head!.ref = 'other';
        if (scenario === 'short SHA') p.head!.sha = 'abc';
        if (scenario === 'uppercase SHA') p.head!.sha = HEAD.toUpperCase();
        if (scenario === 'missing SHA') delete p.head!.sha;
        if (scenario === 'bad base ref') p.base!.ref = 'bad ref';
        if (scenario === 'self target') p.base!.ref = branch;
        if (scenario === 'missing response') f.get.mockResolvedValue({ data: undefined } as never);
        await expect(f.read()).rejects.toMatchObject({ code: 'workflow.stale' });
    });
    it.each([['list',403],['list',429],['get',404],['get',500]])('preserves native %s failure %s without fallback or provider secrets', async (stage,status) => {
        const f = fixture(); (stage === 'list' ? f.list : f.get).mockRejectedValue({ status, message: 'PRIVATE_TOKEN PRIVATE_URL' });
        await expect(f.read()).rejects.toMatchObject({ code: 'provider.unavailable', retryable: true, message: expect.not.stringContaining('PRIVATE_') });
    });
    it('rejects an unsafe native branch before resolving the credential', async () => { const f = fixture(); await expect(f.read('../outside')).rejects.toMatchObject({ code: 'configuration.invalid' }); expect(f.getClient).not.toHaveBeenCalled(); });
});
