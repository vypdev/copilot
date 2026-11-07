import * as progressSddSeed from '../../../application/usecases/sdd/read_progress_sdd_seed';
import { BugbotIssueCommentQueryRepository } from '../../../data/repository/issue/bugbot_issue_comment_query_repository';

import * as github from '@actions/github';
import { CheckProgressUseCase } from '../../../application/usecases/actions/check_progress_use_case';
import { createCheckProgressCompositionRoot } from '../check_progress_composition_root';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));
jest.mock('../../../application/usecases/actions/check_progress_use_case', () => ({ CheckProgressUseCase: jest.fn() }));
jest.mock('../agent_capability_composition_root', () => ({ createFindingsQueryPort: () => ({ query: jest.fn() }) }));
const mockReadIssue = jest.fn();
const mockRemoveLabel = jest.fn();
jest.mock('../issue_completion_composition_root', () => ({
    ...jest.requireActual('../issue_completion_composition_root'),
    createIssueCompletionRepository: () => ({
        readIssue: mockReadIssue, readPullRequest: jest.fn(), removeLabel: mockRemoveLabel,
    }),
}));

it('binds both progress evidence queries to one repository/credential and exposes only frozen read capabilities', async () => {
    const base = 'a'.repeat(40), head = 'b'.repeat(40);
    const list = jest.fn(async () => ({ data: [] }));
    const compareCommits = jest.fn(async () => ({ data: {
        base_commit: { sha: base }, merge_base_commit: { sha: base },
        ahead_by: 1, behind_by: 0, total_commits: 1, files: [], commits: [],
    } }));
    jest.mocked(github.getOctokit).mockReturnValue({ rest: {
        pulls: { list, get: jest.fn() }, repos: { compareCommits },
    } } as never);

    createCheckProgressCompositionRoot({ owner: 'tenant', repository: 'project', token: 'fixture-private-token' });
    const args = jest.mocked(CheckProgressUseCase).mock.calls[0], diff = args[7], source = args[8];
    expect(Object.keys(diff)).toEqual(['getDiff']);
    expect(Object.keys(source)).toEqual(['getSource']);
    expect(Object.isFrozen(diff)).toBe(true);
    expect(Object.isFrozen(source)).toBe(true);
    expect(await source.getSource('chore/727-scope')).toEqual({ kind: 'none' });
    expect((await diff.getDiff(base, head)).kind).toBe('single');
    expect(list).toHaveBeenCalledWith({
        owner: 'tenant', repo: 'project', state: 'open', head: 'tenant:chore/727-scope', per_page: 2, page: 1,
    });
    expect(compareCommits).toHaveBeenCalledWith({ owner: 'tenant', repo: 'project', base, head, per_page: 1, page: 1 });
    expect(github.getOctokit).toHaveBeenCalledWith('fixture-private-token');
});

it('binds rollout recovery to the exact issue and removes only stale 100% from open work', async () => {
    const binding = { owner: 'tenant', repository: 'project', token: 'fixture-private-token' };
    createCheckProgressCompositionRoot(binding);
    const fence = jest.mocked(CheckProgressUseCase).mock.lastCall?.[9];
    expect(Object.keys(fence!)).toEqual(['listIssueComments', 'removeFullProgressLabel']);
    expect(Object.isFrozen(fence)).toBe(true);
    mockReadIssue.mockResolvedValueOnce({ number: 42, state: 'open', labels: ['100%', 'external'] })
        .mockResolvedValueOnce({ number: 42, state: 'closed', labels: ['100%'] });
    await fence!.removeFullProgressLabel(42);
    await fence!.removeFullProgressLabel(42);
    expect(mockRemoveLabel).toHaveBeenCalledTimes(1);
    expect(mockRemoveLabel).toHaveBeenCalledWith(42, '100%');
});

it.each([
    ['default', undefined, 'https://github.com/tenant/project'],
    ['configured', 'https://github.example.test', 'https://github.example.test/tenant/project'],
])('binds the SDD selection inventory to the same repository and credential on the %s server', async (_name, server, repositoryUrl) => {
    const originalServer = process.env.GITHUB_SERVER_URL;
    const bindSeed = jest.spyOn(progressSddSeed, 'createProgressSddSeedQuery');
    const list = jest.spyOn(BugbotIssueCommentQueryRepository.prototype, 'listBugbotIssueCommentsBounded')
        .mockResolvedValueOnce({ items: [], coverage: { source: 'issue-comments', status: 'partial', pagesFetched: 1,
            itemsFetched: 0, itemsRetained: 0, omittedItems: 1, truncatedItems: 0, limitReached: true } });
    try {
        if (server === undefined) delete process.env.GITHUB_SERVER_URL;
        else process.env.GITHUB_SERVER_URL = server;
        const binding = { owner: 'tenant', repository: 'project', token: 'fixture-private-token' };
        createCheckProgressCompositionRoot(binding);
        expect(bindSeed).toHaveBeenCalledWith(expect.objectContaining({ comments: expect.anything() }), repositoryUrl);
        const query = jest.mocked(CheckProgressUseCase).mock.lastCall?.[10];
        await expect(query!({ issueNumber: 42, issueBody: 'Issue', issueKind: 'feature', trustedBotLogin: 'bot',
            branch: 'feature/42-change', headSha: 'a'.repeat(40), seed: 'draft', seedHash: 'b'.repeat(64) }))
            .rejects.toMatchObject({ recovery: { id: 'progress-sdd-seed-unverified', variables: {} } });
        expect(list).toHaveBeenCalledWith('tenant', 'project', 42, 'fixture-private-token');
    } finally {
        list.mockRestore();
        bindSeed.mockRestore();
        if (originalServer === undefined) delete process.env.GITHUB_SERVER_URL;
        else process.env.GITHUB_SERVER_URL = originalServer;
    }
});
