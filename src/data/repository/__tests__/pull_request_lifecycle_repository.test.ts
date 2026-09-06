import { PullRequestLifecycleRepository } from "../pull_request/pull_request_lifecycle_repository";
import { OctokitPullRequestLifecycleClientAdapter } from "../../../infrastructure/github/octokit_pull_request_adapters";

const mockList = jest.fn();
const mockUpdate = jest.fn();
const mockGet = jest.fn();

jest.mock("@actions/github", () => ({
    getOctokit: jest.fn(() => ({ rest: { pulls: { list: mockList, update: mockUpdate, get: mockGet } } })),
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

    it("finds an issue reference in the PR body or head branch with bounded matching", async () => {
        mockList.mockResolvedValue({
            data: [
                { number: 1, body: "Resolves #1234", head: { ref: "feature/1234-fix" } },
                { number: 2, body: "Resolves #123", head: { ref: "feature/123-other" } },
            ],
        });

        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());
        await expect(repository.getHeadBranchForIssue("owner", "repo", 123, "token"))
            .resolves.toBe("feature/123-other");
    });

    it("returns no branch when no open PR references the issue", async () => {
        mockList.mockResolvedValue({ data: [{ number: 1, body: "Unrelated", head: { ref: "feature/999" } }] });

        await expect(new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter()).getHeadBranchForIssue(
            "owner", "repo", 123, "token",
        )).resolves.toBeUndefined();
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

    it("returns false for non-success responses and network failures when checking linkage", async () => {
        const fetchMock = jest.spyOn(global, "fetch")
            .mockResolvedValueOnce(new Response("not linked", { status: 404 }))
            .mockRejectedValueOnce(new Error("network unavailable"));
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());

        await expect(repository.isLinked("https://github.com/owner/repo/pull/12")).resolves.toBe(false);
        await expect(repository.isLinked("https://github.com/owner/repo/pull/12")).resolves.toBe(false);
        fetchMock.mockRestore();
    });

    it("detects linked GitHub issue metadata from the HTML response", async () => {
        const fetchMock = jest.spyOn(global, "fetch")
            .mockResolvedValueOnce(new Response("has_github_issues=true", { status: 200 }))
            .mockResolvedValueOnce(new Response("has_github_issues=false", { status: 200 }));
        const repository = new PullRequestLifecycleRepository(new OctokitPullRequestLifecycleClientAdapter());

        await expect(repository.isLinked("https://github.com/owner/repo/pull/12")).resolves.toBe(true);
        await expect(repository.isLinked("https://github.com/owner/repo/pull/12")).resolves.toBe(false);
        fetchMock.mockRestore();
    });
});
