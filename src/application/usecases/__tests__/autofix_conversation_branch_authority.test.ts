import { runCommentAutomationAction } from '../comment_automation_action_workflow';
import { Result } from '../../../data/model/result';

const commit = jest.fn();
jest.mock('../steps/commit/bugbot/commit_autofix_and_resolve_workflow', () => ({ commitAutofixAndResolveFindings: (...args: unknown[]) => commit(...args) }));
function fixture(pr = true) {
    const branch = 'bugfix/42-managed';
    const target = { userComment: '/copilot fix all', status: { branch }, bugbot: {
        publicationMode: 'publish', autofix: {}, commit: { branch: '' }, review: {}, fixIntent: {
            repository: { owner: 'o', name: 'r' }, target: { isPullRequest: pr, issueNumber: 42, pullRequestNumber: 77, headBranch: branch },
            trigger: { kind: 'issue_comment', headOwner: 'o' }, ignorePatterns: [], organizationRules: [],
        },
    } };
    const candidate = { number: 77, state: 'open', draft: false, baseRepository: { owner: 'o', name: 'r' },
        headRepositoryOwner: 'o', headRepositoryName: 'r', headRef: branch, headSha: 'a'.repeat(40) };
    const read = jest.fn().mockResolvedValue(candidate);
    const linked = jest.fn().mockResolvedValue({ name: branch, headSha: 'a'.repeat(40) });
    const invoke = jest.fn().mockResolvedValue([new Result({ id: 'autofix', success: true, executed: true })]);
    const options = { taskId: 'CommentAutomation', autofixUseCase: { invoke }, bugbotGitMutationPort: {},
        rememberBranchPorts: { pullRequests: { getPullRequest: read }, linkedBranches: { getLinkedBranch: linked } } };
    const intent = { targetFindingIds: ['finding-1'] };
    const run = () => runCommentAutomationAction(target as never, options as never, 'autofix', intent as never);
    return { branch, target, candidate, read, linked, invoke, options, intent, run };
}
beforeEach(() => commit.mockReset().mockResolvedValue([]));
it.each([true, false])('carries exact native conversation branch through agent and commit (PR=%s)', async pr => {
    const f = fixture(pr); await f.run();
    expect(f.invoke).toHaveBeenCalledWith(expect.objectContaining({ branchOverride: f.branch }));
    expect(commit.mock.calls[0][1]).toEqual({ targetFindingIds: ['finding-1'], branchOverride: f.branch });
    expect(pr ? f.read : f.linked).toHaveBeenCalledTimes(1);
    expect(pr ? f.linked : f.read).not.toHaveBeenCalled();
});
it('rejects an intent override that disagrees with native authority before any edits', async () => {
    const f = fixture(); Object.assign(f.intent, { branchOverride: 'master' });
    expect((await f.run())[0].errors[0]).toMatchObject({ code: 'workflow.stale' });
    expect(f.invoke).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});
it.each([
    { headRepositoryOwner: 'fork' }, { headRepositoryName: 'other' }, { state: 'closed' }, { number: 78 },
])('rejects foreign or closed PR authority: %j', async delta => {
    const f = fixture(); f.read.mockResolvedValue({ ...f.candidate, ...delta });
    expect((await f.run())[0]).toMatchObject({ success: false, executed: false });
    expect(f.invoke).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});
it('rejects absent native branch readers before the fixer', async () => {
    const f = fixture(); Object.assign(f.options, { rememberBranchPorts: undefined });
    expect((await f.run())[0].success).toBe(false); expect(f.invoke).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});
it('rejects a denied exact PR read without falling back to Git HEAD', async () => {
    const f = fixture(); f.read.mockRejectedValue(new Error('Denied'));
    expect((await f.run())[0].success).toBe(false); expect(f.invoke).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});
it('rejects issue branch evidence that no longer has its native link', async () => {
    const f = fixture(false); f.linked.mockResolvedValue(undefined);
    expect((await f.run())[0].success).toBe(false); expect(f.invoke).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});

it('retains an explicit override only when it matches the verified PR branch', async () => {
    const f = fixture(); Object.assign(f.intent, { branchOverride: f.branch }); await f.run();
    expect(f.invoke).toHaveBeenCalledWith(expect.objectContaining({ branchOverride: f.branch }));
    expect(commit.mock.calls[0][1].branchOverride).toBe(f.branch);
});
it('rejects an empty PR head ref before starting the fixer', async () => {
    const f = fixture(); f.read.mockResolvedValue({ ...f.candidate, headRef: '' });
    expect((await f.run())[0].success).toBe(false); expect(f.invoke).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled();
});
