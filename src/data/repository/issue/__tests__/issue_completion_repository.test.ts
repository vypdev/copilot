import { IssueCompletionRepository } from '../issue_completion_repository';
const binding = { owner: 'o', repository: 'r', token: 'private-token', apiBaseUrl: 'https://api.github.com' };
const repositoryUrl = 'https://api.github.com/repos/o/r';
function fixture() {
    const issue = { number: 42, state: 'closed', state_reason: 'completed', repository_url: repositoryUrl,
        labels: [{ name: 'SDD' }, '55%'] };
    const get = jest.fn().mockResolvedValue({ url: `${repositoryUrl}/issues/42`, data: issue });
    const update = jest.fn().mockResolvedValue({}); const addLabels = jest.fn().mockResolvedValue({}); const removeLabel = jest.fn().mockResolvedValue({});
    const getPull = jest.fn().mockResolvedValue({ url: `${repositoryUrl}/pulls/10`,
        data: { number: 10, state: 'closed', merged: true, base: { repo: { url: repositoryUrl } } } });
    const client = { rest: { issues: { get, update, addLabels, removeLabel }, pulls: { get: getPull } } };
    return { issue, get, update, addLabels, removeLabel, getPull, client,
        repository: new IssueCompletionRepository({ getClient: () => client }, binding) };
}
describe('native issue completion repository', () => {
    it('normalizes an immutable complete inventory and rejects redirects at the HTTP boundary', async () => {
        const f = fixture(); const facts = await f.repository.readIssue(42);
        expect(facts).toEqual({ number: 42, state: 'closed', reason: 'completed', labels: ['SDD', '55%'] });
        expect(Object.isFrozen(facts)).toBe(true); expect(Object.isFrozen(facts.labels)).toBe(true);
        expect(f.get).toHaveBeenCalledWith({ owner: 'o', repo: 'r', issue_number: 42, request: { redirect: 'error' } });
    });
    it('rejects an unsafe issue number before a native request', async () => {
        const f = fixture(); await expect(f.repository.readIssue(0)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
        expect(f.get).not.toHaveBeenCalled();
    });
    it.each(['number', 'repository', 'redirect', 'PR-subject', 'inventory', 'entry', 'bound', 'reason'])(
        'rejects incomplete or foreign %s facts', async failure => {
            const f = fixture(); const data: Record<string, unknown> = { ...f.issue };
            if (failure === 'number') data.number = 43;
            if (failure === 'repository') data.repository_url = 'https://api.github.com/repos/o/other';
            if (failure === 'PR-subject') data.pull_request = {};
            if (failure === 'inventory') delete data.labels;
            if (failure === 'entry') data.labels = [{ name: 42 }];
            if (failure === 'bound') data.labels = Array.from({ length: 1001 }, (_, i) => `label-${i}`);
            if (failure === 'reason') data.state_reason = {};
            f.get.mockResolvedValue({ data, url: failure === 'redirect' ? 'https://foreign.invalid/repos/o/r/issues/42' : `${repositoryUrl}/issues/42` });
            await expect(f.repository.readIssue(42)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
            expect(f.update).not.toHaveBeenCalled(); expect(f.addLabels).not.toHaveBeenCalled();
        },
    );
    it('keeps null closure reason unknown instead of completed', async () => {
        const f = fixture(); f.get.mockResolvedValue({ url: `${repositoryUrl}/issues/42`, data: { ...f.issue, state_reason: null } });
        expect(await f.repository.readIssue(42)).toMatchObject({ reason: 'unknown' });
    });
    it('maps denied reads without including raw provider bodies or credentials', async () => {
        const f = fixture(); f.get.mockRejectedValue(new Error('private-token / raw provider body'));
        await expect(f.repository.readIssue(42)).rejects.toMatchObject({ code: 'provider.unavailable',
            message: 'Current native issue completion facts could not be verified.' });
    });
    it('writes selective label deltas without a full inventory replacement', async () => {
        const f = fixture(); await f.repository.removeLabel(42, '55%'); await f.repository.addLabel(42, '100%');
        expect(f.removeLabel).toHaveBeenCalledWith({ owner: 'o', repo: 'r', issue_number: 42, name: '55%', request: { redirect: 'error' } });
        expect(f.addLabels).toHaveBeenCalledWith({ owner: 'o', repo: 'r', issue_number: 42, labels: ['100%'], request: { redirect: 'error' } });
        expect(f.update).not.toHaveBeenCalled();
    });
    it('sets completed reason only on an actual open-to-closed native transition', async () => {
        const f = fixture(); expect(await f.repository.closeIssue(42)).toBe(false); expect(f.update).not.toHaveBeenCalled();
        f.get.mockResolvedValue({ url: `${repositoryUrl}/issues/42`, data: { ...f.issue, state: 'open' } });
        expect(await f.repository.closeIssue(42)).toBe(true);
        expect(f.update).toHaveBeenCalledWith({ owner: 'o', repo: 'r', issue_number: 42, state: 'closed', state_reason: 'completed', request: { redirect: 'error' } });
    });
    it('requires strict merged facts in the exact native base repository', async () => {
        const f = fixture(); expect(await f.repository.readPullRequest(10)).toEqual({ number: 10, state: 'closed', merged: true });
        f.getPull.mockResolvedValue({ url: `${repositoryUrl}/pulls/10`, data: { number: 10, state: 'closed', merged: 'true', base: { repo: { url: repositoryUrl } } } });
        await expect(f.repository.readPullRequest(10)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
    });
});

describe('completion write failures', () => {
    it.each(['close', 'add', 'remove'] as const)('maps denied %s writes without exposing provider content', async operation => {
        const f = fixture(); const error = new Error('private-token / raw provider diagnostics');
        f.get.mockResolvedValue({ url: `${repositoryUrl}/issues/42`, data: { ...f.issue, state: 'open' } });
        f.update.mockRejectedValue(error); f.addLabels.mockRejectedValue(error); f.removeLabel.mockRejectedValue(error);
        const call = operation === 'close' ? f.repository.closeIssue(42)
            : operation === 'add' ? f.repository.addLabel(42, '100%') : f.repository.removeLabel(42, '55%');
        await expect(call).rejects.toMatchObject({ code: 'provider.unavailable' });
        await expect(call).rejects.not.toMatchObject({ message: expect.stringContaining('private-token') });
    });
});
