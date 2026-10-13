import { getOctokitClient } from '../../github/octokit_client_resolver';
jest.mock('../../github/octokit_client_resolver', () => ({ getOctokitClient: jest.fn() }));
import { bindIssueCompletion, bindNativeStatusRead, createNativeStatusReadPort, createIssueCompletionRepository } from '../issue_completion_composition_root';
import { IssueCompletionRepository } from '../../../data/repository/issue/issue_completion_repository';
import { CloseIssueAfterMergingUseCase } from '../../../application/usecases/steps/issue/close_issue_after_merging_use_case';
import { projectPullRequestWorkflowStepContexts } from '../../../application/usecases/pull_request_workflow_context';
import { Execution } from '../../../data/model/execution';
import { Labels } from '../../../data/model/labels';

function fixture(apiBase = 'https://api.github.com') {
    const labels = new Set(['in-progress', 'state:working', '55%', 'bugfix', 'branched', 'SDD', 'external']);
    let state = 'open';
    const base = `${apiBase}/repos/o/r`;
    const get = jest.fn(async () => ({ url: `${base}/issues/42`, data: { number: 42, state, state_reason: state === 'closed' ? 'completed' : null,
        repository_url: base, labels: [...labels] } }));
    const update = jest.fn(async () => { state = 'closed'; });
    const addLabels = jest.fn(async (parameters: Record<string, unknown>) => { (parameters.labels as string[]).forEach(label => labels.add(label)); });
    const removeLabel = jest.fn(async (parameters: Record<string, unknown>) => { labels.delete(parameters.name as string); });
    const getPull = jest.fn(async () => ({ url: `${base}/pulls/10`, data: { number: 10, state: 'closed', merged: true, base: { repo: { url: base } } } }));
    const client = { rest: { issues: { get, update, addLabels, removeLabel }, pulls: { get: getPull } } };
    (getOctokitClient as jest.Mock).mockReturnValue(client);
    const repository = new IssueCompletionRepository({ getClient: () => client },
        { owner: 'o', repository: 'r', token: 'captured-private-token', apiBaseUrl: apiBase });
    return { repository, labels, get, update, addLabels, removeLabel, getPull };
}
describe('physical issue completion authority', () => {
    it('freezes a per-issue target with exactly four state/label capabilities', () => {
        const f = fixture(); const port = bindIssueCompletion(f.repository); const target = port.forIssue(42);
        expect(Object.isFrozen(port)).toBe(true); expect(Object.isFrozen(target)).toBe(true);
        expect(Object.keys(target).sort()).toEqual(['addLabel', 'close', 'read', 'removeLabel']);
        expect(target).not.toHaveProperty('addComment'); expect(target).not.toHaveProperty('setLabels');
        expect(JSON.stringify(port)).not.toContain('captured-private-token');
    });
    it('captures the issue number without accepting target or credential overrides at invocation', async () => {
        const previousApi = process.env.GITHUB_API_URL;
        process.env.GITHUB_API_URL = 'https://ghe.example/api/v3';
        const f = fixture(process.env.GITHUB_API_URL);
        const target = bindIssueCompletion(createIssueCompletionRepository({ owner: 'o', repository: 'r', token: 'captured-token' })).forIssue(42);
        if (previousApi === undefined) delete process.env.GITHUB_API_URL; else process.env.GITHUB_API_URL = previousApi;
        await target.read(); await target.removeLabel('55%'); await target.addLabel('100%');
        for (const mock of [f.get, f.removeLabel, f.addLabels]) expect(mock.mock.calls[0][0]).toMatchObject({ owner: 'o', repo: 'r', issue_number: 42 });
    });
    it('exposes only two frozen native queries to status', async () => {
        const f = fixture(); const previousApi = process.env.GITHUB_API_URL; delete process.env.GITHUB_API_URL;
        const read = createNativeStatusReadPort({ owner: 'o', repository: 'r', token: 'captured-token' });
        if (previousApi !== undefined) process.env.GITHUB_API_URL = previousApi;
        expect(Object.keys(bindNativeStatusRead(f.repository)).sort()).toEqual(['readIssue', 'readPullRequest']);
        expect(Object.keys(read).sort()).toEqual(['readIssue', 'readPullRequest']); expect(Object.isFrozen(read)).toBe(true);
        await read.readIssue(42); await read.readPullRequest(10);
        expect(f.update).not.toHaveBeenCalled(); expect(f.addLabels).not.toHaveBeenCalled(); expect(f.removeLabel).not.toHaveBeenCalled();
        expect(read).not.toHaveProperty('forIssue');
    });
    it('rejects unsafe target creation before obtaining an issue capability', () => {
        const f = fixture(); expect(() => bindIssueCompletion(f.repository).forIssue(0)).toThrow('safe issue number');
        expect(() => bindIssueCompletion(f.repository).forIssue(Number.NaN)).toThrow('safe issue number');
        expect(f.get).not.toHaveBeenCalled(); expect(f.update).not.toHaveBeenCalled();
    });
    it('projects immutable completion labels from actual Execution and completes through the bound native adapter', async () => {
        const names = ['bug', 'bugfix', 'hotfix', 'enhancement', 'feature', 'release', 'question', 'help', 'deploy', 'deployed', 'docs', 'documentation', 'chore', 'maintenance',
            'priority: high', 'priority: medium', 'priority: low', 'priority: none', 'size: XXL', 'size: XL', 'size: L', 'size: M', 'size: S', 'size: XS'] as const;
        const labels = new Labels(...names);
        const execution = new Execution({ labels, issue: { number: 42, creator: 'human', desiredAssigneesCount: 0, isIssue: false, isIssueComment: false },
            pullRequest: { number: 10, isPullRequest: true, isPullRequestReviewComment: false, creator: 'human', desiredAssigneesCount: 0, desiredReviewersCount: 0, body: 'Closes #42', head: 'bugfix/42', base: 'develop' },
            singleAction: { enabledSingleAction: false, isIssue: false, isPullRequest: false }, branches: { defaultBranch: 'master' },
            projects: { getProjects: () => [] }, ai: { getPullRequestDescriptionMode: () => 'append', getAiMembersOnly: () => false,
                getAgentConfiguration: () => ({ provider: 'codex', modelProvider: 'openai', model: 'test', effort: 'low' }) },
            locale: { pullRequest: 'en-US' }, inputs: { eventName: 'pull_request', repo: { owner: 'o', repo: 'r' } } } as never);
        execution.issueNumber = 42;
        const context = projectPullRequestWorkflowStepContexts(execution).closeIssue;
        expect(Object.isFrozen(context.completionLabels.lifecycle)).toBe(true); expect(Object.isFrozen(context.completionLabels.protectedLabels)).toBe(true);
        labels.lifecycle.working = 'changed-after-projection';
        expect(context.completionLabels.lifecycle.working).toBe('state:working');
        const f = fixture(); const [result] = await new CloseIssueAfterMergingUseCase(bindIssueCompletion(f.repository)).invoke(context);
        expect(result).toMatchObject({ success: true, payload: { issueCompletion: { nativeClosed: true, closedThisRun: true, reconciled: true } } });
        expect([...f.labels]).toEqual(['bugfix', 'branched', 'SDD', 'external', '100%']);
    });
});
