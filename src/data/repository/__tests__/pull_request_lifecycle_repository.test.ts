import { PullRequestLifecycleRepository } from "../pull_request/pull_request_lifecycle_repository";
import { OctokitPullRequestLifecycleClientAdapter } from "../../../infrastructure/github/octokit_pull_request_adapters";

const mockList = jest.fn();
const mockUpdate = jest.fn();
const mockGet = jest.fn();
const mockGraphql = jest.fn();

jest.mock("@actions/github", () => ({
    getOctokit: jest.fn(() => ({ graphql: mockGraphql, rest: { pulls: { list: mockList, update: mockUpdate, get: mockGet } } })),
}));

jest.mock("../../../utils/logger", () => ({
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

describe("PullRequestLifecycleRepository", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockUpdate.mockResolvedValue({});
        mockGet.mockReset();
        mockGraphql.mockReset();
    });

    it("lists open pull requests by head branch", async () => {
        mockList.mockResolvedValue({ data: [{ number: 12 }, { number: 34 }] });

        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter()).getOpenPullRequestNumbersByHeadBranch("owner", "repo", "feature/12", "token"))
            .resolves.toEqual([12, 34]);
        expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ head: "owner:feature/12", state: "open" }));
    });

    it("reads every page when the repository has more than one hundred matching pull requests", async () => {
        mockList
            .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, index) => ({ number: index + 1 })) })
            .mockResolvedValueOnce({ data: [{ number: 101 }] });

        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter()).getOpenPullRequestNumbersByHeadBranch("owner", "repo", "feature/12", "token"))
            .resolves.toEqual([...Array.from({ length: 100 }, (_, index) => index + 1), 101]);
        expect(mockList).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2, per_page: 100 }));
    });

    it("preserves provider failures instead of treating them as an empty result", async () => {
        mockList.mockRejectedValue(new Error("rate limited"));

        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter()).getOpenPullRequestNumbersByHeadBranch("owner", "repo", "feature/12", "token"))
            .rejects.toThrow("rate limited");
    });

    it('uses one exact-head query capped at two canonical Bugbot candidates', async () => {
        mockList.mockResolvedValue({ data: [
            pullRequestIdentity(12),
            pullRequestIdentity(13),
            pullRequestIdentity(14),
        ] });
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());

        await expect(repository.findOpenBugbotPullRequestsByExactHead(
            'owner', 'repo', 'fork-owner', 'feature/12', 'token',
        )).resolves.toEqual([
            expect.objectContaining({ number: 12, headRepositoryOwner: 'fork-owner', headRef: 'feature/12' }),
            expect.objectContaining({ number: 13, headRepositoryOwner: 'fork-owner', headRef: 'feature/12' }),
        ]);
        expect(mockList).toHaveBeenCalledTimes(1);
        expect(mockList).toHaveBeenCalledWith({
            owner: 'owner',
            repo: 'repo',
            state: 'open',
            head: 'fork-owner:feature/12',
            per_page: 2,
            page: 1,
        });
    });

    it('verifies a direct event pull request as a full canonical identity', async () => {
        mockGet.mockResolvedValue({ data: pullRequestIdentity(12) });
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());

        await expect(repository.getBugbotPullRequestIdentity(
            'owner', 'repo', 12, 'token',
        )).resolves.toEqual({
            number: 12,
            state: 'open',
            draft: false,
            baseRepository: { owner: 'owner', name: 'repo', id: 7 },
            headRepositoryOwner: 'fork-owner',
            headRef: 'feature/12',
            headSha: 'a'.repeat(40),
        });
        expect(mockGet).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', pull_number: 12 });
    });

    it('rejects incomplete Bugbot identity records instead of guessing', async () => {
        mockGet.mockResolvedValue({ data: { number: 12, state: 'open' } });
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());
        await expect(repository.getBugbotPullRequestIdentity(
            'owner', 'repo', 12, 'token',
        )).rejects.toMatchObject({
            code: 'provider.unavailable',
            message: 'Unable to verify pull request #12.',
        });
    });

    it('retains the provider draft state on the canonical identity', async () => {
        mockGet.mockResolvedValue({ data: { ...pullRequestIdentity(12), draft: true } });
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());
        await expect(repository.getBugbotPullRequestIdentity('owner', 'repo', 12, 'token'))
            .resolves.toEqual(expect.objectContaining({ draft: true }));
    });

    it('retains the exact head repository name for authorized write-target verification', async () => {
        const identity = pullRequestIdentity(12);
        mockGet.mockResolvedValue({ data: { ...identity, head: { ...identity.head, repo: { ...identity.head.repo, name: '  fork-repo  ' } } } });
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .getBugbotPullRequestIdentity('owner', 'repo', 12, 'token'))
            .resolves.toEqual(expect.objectContaining({ headRepositoryName: 'fork-repo' }));
    });

    it('does not infer an absent head repository name from the base repository', async () => {
        const identity = pullRequestIdentity(12);
        mockGet.mockResolvedValue({ data: { ...identity, head: { ...identity.head, repo: { ...identity.head.repo, name: '  ' } } } });
        const result = await new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .getBugbotPullRequestIdentity('owner', 'repo', 12, 'token');
        expect(result).not.toHaveProperty('headRepositoryName');
    });

    it.each([undefined, null, 'true'])('rejects an absent or malformed provider draft state: %s', async draft => {
        mockGet.mockResolvedValue({ data: { ...pullRequestIdentity(12), draft } });
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());
        await expect(repository.getBugbotPullRequestIdentity('owner', 'repo', 12, 'token'))
            .rejects.toMatchObject({ code: 'provider.unavailable' });
    });

    it('maps Bugbot identity and exact-head failures to sanitized provider errors', async () => {
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());
        mockGet.mockRejectedValueOnce(new Error('secret identity failure'));
        await expect(repository.getBugbotPullRequestIdentity(
            'owner', 'repo', 12, 'token',
        )).rejects.toMatchObject({
            code: 'provider.unavailable',
            message: 'Unable to verify pull request #12.',
        });

        mockList.mockRejectedValueOnce(new Error('secret exact-head failure'));
        await expect(repository.findOpenBugbotPullRequestsByExactHead(
            'owner', 'repo', 'fork-owner', 'feature/12', 'token',
        )).rejects.toMatchObject({
            code: 'provider.unavailable',
            message: 'Unable to resolve the exact pull request for fork-owner:feature/12.',
        });
    });

    it("updates the base branch and description through the lifecycle client", async () => {
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());

        await repository.updateBaseBranch("owner", "repo", 12, "develop", "token");
        await repository.updateDescription("owner", "repo", 12, "## Summary", "token");

        expect(mockUpdate).toHaveBeenNthCalledWith(1, {
            owner: "owner", repo: "repo", pull_number: 12, base: "develop",
        });
        expect(mockUpdate).toHaveBeenNthCalledWith(2, {
            owner: "owner", repo: "repo", pull_number: 12, body: "## Summary",
        });
    });

    it('reads pull-request details for explicit description commands', async () => {
        mockGet.mockResolvedValue({ data: { body: 'Human text', head: { ref: 'feature/12' }, base: { ref: 'develop' } } });
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());

        await expect(repository.getDetails('owner', 'repo', 12, 'token')).resolves.toEqual({
            body: 'Human text',
            headBranch: 'feature/12',
            baseBranch: 'develop',
        });
        expect(mockGet).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', pull_number: 12 });
    });

    it('reads the current pull-request head SHA for lifecycle reconciliation', async () => {
        mockGet.mockResolvedValue({ data: { head: { sha: 'sha-current' } } });
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());

        await expect(repository.getPullRequestHeadSha('owner', 'repo', 12, 'token')).resolves.toBe('sha-current');
        expect(mockGet).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', pull_number: 12 });
    });

    it.each(['private', 'public'])('authenticates %s PR linkage for the exact repository, PR and issue', async () => {
        const fetchMock = jest.spyOn(global, 'fetch');
        mockGraphql.mockResolvedValue(linkage([42]));
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());
        await expect(repository.isLinked('owner', 'repo', 12, 42, 'PRIVATE_TOKEN')).resolves.toBe(true);
        expect(jest.requireMock('@actions/github').getOctokit).toHaveBeenCalledWith('PRIVATE_TOKEN');
        expect(mockGraphql).toHaveBeenCalledWith(expect.stringContaining('closingIssuesReferences(first: 100'), {
            owner: 'owner', repo: 'repo', number: 12, cursor: null,
        });
        expect(fetchMock).not.toHaveBeenCalled();
        fetchMock.mockRestore();
    });

    it('does not confuse another issue or a foreign repository with the intended issue', async () => {
        const response = linkage([41, 42]);
        response.repository.pullRequest.closingIssuesReferences.nodes[1].repository.nameWithOwner = 'foreign/repo';
        mockGraphql.mockResolvedValue(response);
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .isLinked('owner', 'repo', 12, 42, 'token')).resolves.toBe(false);
    });

    it('proves absence from an empty complete reference list', async () => {
        mockGraphql.mockResolvedValue(linkage([]));
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .isLinked('owner', 'repo', 12, 42, 'token')).resolves.toBe(false);
    });

    it('follows one bounded cursor to find the intended issue', async () => {
        mockGraphql.mockResolvedValueOnce(linkage([41], true, 'next')).mockResolvedValueOnce(linkage([42]));
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .isLinked('owner', 'repo', 12, 42, 'token')).resolves.toBe(true);
        expect(mockGraphql).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({ cursor: 'next' }));
    });

    it.each([
        [401, 'authorization.credential-invalid'], [403, 'authorization.denied'],
        [404, 'provider.not-found'], [429, 'provider.rate-limited'], [503, 'provider.unavailable'],
        [undefined, 'provider.unavailable'],
    ])('maps HTTP %s without exposing provider details', async (status, code) => {
        mockGraphql.mockRejectedValue(Object.assign(new Error('PRIVATE_SECRET'), { status }));
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .isLinked('owner', 'repo', 12, 42, 'token')).rejects.toMatchObject({
                code, message: 'Unable to inspect issue linkage for pull request #12.',
            });
    });

    it.each([['FORBIDDEN', 'authorization.denied'], ['NOT_FOUND', 'provider.not-found'], ['RATE_LIMITED', 'provider.rate-limited'], ['INTERNAL', 'provider.unavailable']])('maps GraphQL %s errors from HTTP 200', async (type, code) => {
        mockGraphql.mockRejectedValue({ status: 200, errors: [{ type, message: 'PRIVATE_SECRET' }] });
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .isLinked('owner', 'repo', 12, 42, 'token')).rejects.toMatchObject({ code });
    });

    it('treats GraphQL UNAUTHORIZED on HTTP 200 as a terminal access failure', async () => {
        mockGraphql.mockRejectedValue({ status: 200, errors: [{ type: 'UNAUTHORIZED', message: 'PRIVATE_SECRET' }] });
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .isLinked('owner', 'repo', 12, 42, 'token')).rejects.toMatchObject({
                code: 'authorization.denied', retryable: false,
                message: 'Unable to inspect issue linkage for pull request #12.',
            });
    });

    it('distinguishes secondary rate limiting from denied permissions', async () => {
        mockGraphql.mockRejectedValue({ status: 403, response: { headers: { 'retry-after': '30' } } });
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .isLinked('owner', 'repo', 12, 42, 'token')).rejects.toMatchObject({ code: 'provider.rate-limited' });
    });

    it.each(['missing PR', 'wrong PR', 'wrong repository', 'missing references', 'invalid node', 'missing page facts', 'missing cursor', 'exhausted pages'])('fails closed on %s', async scenario => {
        const response = linkage([41], scenario === 'missing cursor' || scenario === 'exhausted pages', 'next');
        if (scenario === 'missing PR') Object.assign(response.repository, { pullRequest: null });
        if (scenario === 'wrong PR') response.repository.pullRequest.number = 13;
        if (scenario === 'wrong repository') response.repository.nameWithOwner = 'foreign/repo';
        if (scenario === 'missing references') Object.assign(response.repository.pullRequest, { closingIssuesReferences: null });
        if (scenario === 'invalid node') Object.assign(response.repository.pullRequest.closingIssuesReferences, { nodes: [null] });
        if (scenario === 'missing page facts') Object.assign(response.repository.pullRequest.closingIssuesReferences, { pageInfo: {} });
        if (scenario === 'missing cursor') Object.assign(response.repository.pullRequest.closingIssuesReferences.pageInfo, { endCursor: null });
        mockGraphql.mockResolvedValue(response);
        if (scenario === 'exhausted pages') mockGraphql.mockResolvedValueOnce(response).mockResolvedValueOnce(linkage([41], true, 'last'));
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .isLinked('owner', 'repo', 12, 42, 'token')).rejects.toMatchObject({
                code: scenario === 'missing PR' ? 'provider.not-found' : 'provider.contract-invalid', retryable: false,
            });
        expect(mockGraphql.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('reports unsupported authenticated queries without falling back to HTML', async () => {
        const repository = new PullRequestLifecycleRepository({ getClient: () => ({ rest: { pulls: { list: mockList, update: mockUpdate } } }) });
        await expect(repository.isLinked('owner', 'repo', 12, 42, 'token'))
            .rejects.toMatchObject({ code: 'configuration.unsupported', retryable: false });
    });

    it('rejects invalid identities before using credentials', async () => {
        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter())
            .isLinked('owner', 'repo', 12, 0, 'token')).rejects.toMatchObject({ code: 'validation.invalid-input' });
        expect(mockGraphql).not.toHaveBeenCalled();
    });

});

function pullRequestIdentity(number: number) {
    return {
        number,
        state: 'open',
        draft: false,
        head: {
            ref: 'feature/12',
            sha: 'a'.repeat(40),
            repo: { owner: { login: 'fork-owner' } },
        },
        base: {
            repo: { id: 7, name: 'repo', owner: { login: 'owner' } },
        },
    };
}

function linkage(numbers: number[], hasNextPage = false, endCursor: string | null = null) {
    return { repository: { nameWithOwner: 'owner/repo', pullRequest: { number: 12,
        closingIssuesReferences: {
            nodes: numbers.map(number => ({ number, repository: { nameWithOwner: 'owner/repo' } })),
            pageInfo: { hasNextPage, endCursor },
        },
    } } };
}
