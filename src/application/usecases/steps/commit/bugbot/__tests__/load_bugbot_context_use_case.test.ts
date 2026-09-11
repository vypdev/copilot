/**
 * Unit tests for loadBugbotContext: issue/PR comment parsing, open PRs, previousFindingsBlock, prContext.
 */

import { loadBugbotContext as loadBugbotContextImpl, type LoadBugbotContextOptions } from "../load_bugbot_context_use_case";
import type { Execution } from "../../../../../../data/model/execution";
import { Ai } from "../../../../../../data/model/ai";
import { buildMarker } from "../marker";

jest.mock("../../../../../../utils/logger", () => ({
    logDebugInfo: jest.fn(),
}));

const mockListIssueComments = jest.fn();
const mockGetOpenPullRequestNumbersByHeadBranch = jest.fn();
const mockListPullRequestReviewComments = jest.fn();
const mockGetPullRequestHeadSha = jest.fn();
const mockGetChangedFiles = jest.fn();
const mockGetFilesWithFirstDiffLine = jest.fn();
const mockGetFilesWithDiffLocations = jest.fn();
const mockGetReviewDiffSnapshot = jest.fn();
const mockListPullRequestReviewThreadStates = jest.fn();
const mockListPullRequestReviews = jest.fn();
const mockLoadRules = jest.fn();
const marker = (id: string, resolved: boolean) =>
    buildMarker(id, resolved, 'fp-11111111', 'sf-11111111');



import type { BugbotContextPorts } from "../../../../../../application/ports/bugbot_context_ports";

const testPorts: BugbotContextPorts = {
    issue: { listIssueComments: mockListIssueComments },
    reviewState: { listPullRequestReviews: mockListPullRequestReviews },
    navigation: { forPullRequest: jest.fn() },
    rules: { loadRules: mockLoadRules },
    pullRequest: {
        getHeadBranchForIssue: jest.fn(),
        getPullRequestReviewCommentBody: jest.fn(),
        getOpenPullRequestNumbersByHeadBranch: mockGetOpenPullRequestNumbersByHeadBranch,
        listPullRequestReviewComments: mockListPullRequestReviewComments,
        getPullRequestHeadSha: mockGetPullRequestHeadSha,
        getReviewDiffSnapshot: mockGetReviewDiffSnapshot,
        listPullRequestReviewThreadStates: mockListPullRequestReviewThreadStates,
    },
};

function loadBugbotContext(param: Execution, options?: LoadBugbotContextOptions) {
    return loadBugbotContextImpl(param, options, testPorts);
}

function baseParam(overrides: Partial<Execution> = {}): Execution {
    return {
        owner: "o",
        repo: "r",
        issueNumber: 42,
        tokens: { token: "t" },
        tokenUser: "vypbot",
        commit: { branch: "feature/42-foo" },
        currentConfiguration: {},
        branches: { development: "develop" },
        ai: new Ai("", "model", false, [], false, "low", 20),
        ...overrides,
    } as unknown as Execution;
}

describe("loadBugbotContext", () => {
    beforeEach(() => {
        mockListIssueComments.mockReset().mockResolvedValue([]);
        mockGetOpenPullRequestNumbersByHeadBranch.mockReset().mockResolvedValue([]);
        mockListPullRequestReviewComments.mockReset().mockResolvedValue([]);
        mockGetPullRequestHeadSha.mockReset();
        mockGetChangedFiles.mockReset();
        mockGetFilesWithFirstDiffLine.mockReset();
        mockGetFilesWithDiffLocations.mockReset().mockResolvedValue([]);
        mockGetReviewDiffSnapshot.mockReset().mockImplementation(async (...args: unknown[]) => ({
            changes: (await mockGetChangedFiles(...args)).map((change: { filename: string; status: string }) => ({
                additions: 0,
                deletions: 0,
                patch: "",
                ...change,
            })),
            filesWithFirstDiffLine: await mockGetFilesWithFirstDiffLine(...args),
            filesWithDiffLocations: await mockGetFilesWithDiffLocations(...args),
        }));
        mockListPullRequestReviewThreadStates.mockReset().mockResolvedValue({});
        mockListPullRequestReviews.mockReset().mockResolvedValue([]);
        mockLoadRules.mockReset().mockResolvedValue([]);
    });

    it("returns empty existingByFindingId and previousFindingsBlock when no issue comments", async () => {
        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.existingByFindingId).toEqual({});
        expect(ctx.previousFindingsBlock).toBe("");
        expect(ctx.unresolvedFindingsWithBody).toEqual([]);
    });

    it("returns empty context and does not call APIs when head branch is empty (no branchOverride, empty commit.branch)", async () => {
        const ctx = await loadBugbotContext(
            baseParam({ commit: { branch: "" } } as unknown as Partial<Execution>)
        );

        expect(ctx.existingByFindingId).toEqual({});
        expect(ctx.issueComments).toEqual([]);
        expect(ctx.openPrNumbers).toEqual([]);
        expect(ctx.previousFindingsBlock).toBe("");
        expect(ctx.prContext).toBeNull();
        expect(ctx.unresolvedFindingsWithBody).toEqual([]);
        expect(mockGetOpenPullRequestNumbersByHeadBranch).not.toHaveBeenCalled();
        expect(mockListIssueComments).not.toHaveBeenCalled();
    });

    it("parses issue comments with markers and populates existingByFindingId", async () => {
        mockListIssueComments.mockResolvedValue([
            {
                id: 100,
                user: { login: "vypbot" },
                body: `## Finding A\n\n${marker('id-a', false)}`,
            },
            {
                id: 101,
                user: { login: "vypbot" },
                body: `## Finding B\n\n${marker('id-b', true)}`,
            },
        ]);

        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.existingByFindingId["id-a"]).toEqual({
            issue: { commentId: 100, resolved: false, fingerprint: 'fp-11111111', semanticFingerprint: 'sf-11111111' },
        });
        expect(ctx.existingByFindingId["id-b"]).toEqual({
            issue: { commentId: 101, resolved: true, fingerprint: 'fp-11111111', semanticFingerprint: 'sf-11111111' },
        });
    });

    it("ignores forged markers not authored by the authenticated bot", async () => {
        mockListIssueComments.mockResolvedValue([
            {
                id: 100,
                user: { login: 'contributor' },
                body: marker('forged', true),
            },
            {
                id: 101,
                user: { login: 'VypBot' },
                body: marker('trusted', false),
            },
        ]);

        const ctx = await loadBugbotContext(baseParam({ tokenUser: 'vypbot' }));

        expect(ctx.existingByFindingId).toEqual({
            trusted: { issue: { commentId: 101, resolved: false, fingerprint: 'fp-11111111', semanticFingerprint: 'sf-11111111' } },
        });
    });

    it("ignores existing markers when either authenticated or comment author identity is unavailable", async () => {
        mockListIssueComments.mockResolvedValue([
            {
                id: 100,
                user: { login: 'vypbot' },
                body: marker('missing-token-user', false),
            },
            {
                id: 101,
                body: marker('missing-author', false),
            },
        ]);

        const missingTokenUser = await loadBugbotContext(baseParam({ tokenUser: '' }));
        const missingCommentAuthor = await loadBugbotContext(baseParam());

        expect(missingTokenUser.existingByFindingId).toEqual({});
        expect(missingCommentAuthor.existingByFindingId).toEqual({
            'missing-token-user': { issue: { commentId: 100, resolved: false, fingerprint: 'fp-11111111', semanticFingerprint: 'sf-11111111' } },
        });
    });

    it("updates existingByFindingId when same findingId appears in a later comment", async () => {
        mockListIssueComments.mockResolvedValue([
            {
                id: 100,
                user: { login: "vypbot" },
                body: `## First\n\n${marker('id-a', false)}`,
            },
            {
                id: 101,
                user: { login: "vypbot" },
                body: `## Second (same finding)\n\n${marker('id-a', true)}`,
            },
        ]);

        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.existingByFindingId["id-a"]).toEqual({
            issue: { commentId: 101, resolved: true, fingerprint: 'fp-11111111', semanticFingerprint: 'sf-11111111' },
        });
    });

    it("includes only unresolved findings in previousFindingsBlock and unresolvedFindingsWithBody", async () => {
        mockListIssueComments.mockResolvedValue([
            {
                id: 100,
                user: { login: "vypbot" },
                body: `## Open\n\n${marker('open-1', false)}`,
            },
            {
                id: 101,
                user: { login: "vypbot" },
                body: `## Closed\n\n${marker('closed-1', true)}`,
            },
        ]);

        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.previousFindingsBlock).toContain("open-1");
        expect(ctx.previousFindingsBlock).not.toContain("closed-1");
        expect(ctx.unresolvedFindingsWithBody).toHaveLength(1);
        expect(ctx.unresolvedFindingsWithBody[0].id).toBe("open-1");
    });

    it("uses branchOverride for head branch when provided", async () => {
        mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([50]);

        await loadBugbotContext(
            baseParam({ commit: { branch: "" } } as unknown as Partial<Execution>),
            { branchOverride: "feature/42-from-pr" }
        );

        expect(mockGetOpenPullRequestNumbersByHeadBranch).toHaveBeenCalledWith(
            "o",
            "r",
            "feature/42-from-pr",
            "t"
        );
    });

    it("uses an explicit pull request target without requiring an issue number", async () => {
        mockGetPullRequestHeadSha.mockResolvedValue("pr-sha");
        mockGetChangedFiles.mockResolvedValue([{ filename: "src/foo.ts", status: "modified" }]);
        mockGetFilesWithFirstDiffLine.mockResolvedValue([{ path: "src/foo.ts", firstLine: 4 }]);

        const ctx = await loadBugbotContext(
            baseParam({
                issueNumber: -1,
                isPullRequest: true,
                pullRequest: { head: "feature/no-issue", number: 50 },
            } as unknown as Partial<Execution>),
            { pullRequestNumberOverride: 50, issueNumberOverride: -1 },
        );

        expect(mockListIssueComments).not.toHaveBeenCalled();
        expect(mockGetOpenPullRequestNumbersByHeadBranch).not.toHaveBeenCalled();
        expect(ctx.openPrNumbers).toEqual([50]);
        expect(ctx.prContext?.prHeadSha).toBe("pr-sha");
    });

    it("builds prContext when open PR exists and head sha is available", async () => {
        mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([50]);
        mockGetPullRequestHeadSha.mockResolvedValue("abc123");
        mockGetChangedFiles.mockResolvedValue([
            { filename: "src/foo.ts", status: "modified" },
        ]);
        mockGetFilesWithFirstDiffLine.mockResolvedValue([
            { path: "src/foo.ts", firstLine: 10 },
        ]);

        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.openPrNumbers).toEqual([50]);
        expect(ctx.prContext).not.toBeNull();
        expect(ctx.prContext?.prHeadSha).toBe("abc123");
        expect(ctx.prContext?.prFiles).toHaveLength(1);
        expect(ctx.prContext?.prFiles[0].filename).toBe("src/foo.ts");
        expect(ctx.prContext?.pathToFirstDiffLine["src/foo.ts"]).toBe(10);
    });

    it("leaves prContext null when no open PRs", async () => {
        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.prContext).toBeNull();
    });

    it("merges PR review comment markers into existingByFindingId", async () => {
        mockListIssueComments.mockResolvedValue([]);
        mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([50]);
        mockListPullRequestReviewComments.mockResolvedValue([
            {
                id: 200,
                identity: "PRRC_pr_f1",
                authorLogin: "vypbot",
                body: `## PR finding\n\n${marker('pr-f1', false)}`,
            },
        ]);

        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.existingByFindingId["pr-f1"]).toEqual({
            pullRequest: {
                commentIdentity: "PRRC_pr_f1",
                pullRequestNumber: 50,
                resolved: false,
                fingerprint: 'fp-11111111',
                semanticFingerprint: 'sf-11111111',
            },
        });
    });

    it("persists a manually resolved review thread as dismissed", async () => {
        mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([50]);
        mockListPullRequestReviewComments.mockResolvedValue([
            {
                id: 200,
                identity: "PRRC_manual",
                authorLogin: 'VypBot',
                body: marker('manual', false),
            },
        ]);
        mockListPullRequestReviewThreadStates.mockResolvedValue({
            PRRC_manual: { resolved: true, resolvedByLogin: 'maintainer' },
        });

        const ctx = await loadBugbotContext(baseParam({ tokenUser: 'vypbot' }));

        expect(ctx.existingByFindingId.manual?.pullRequest).toEqual(expect.objectContaining({
            resolved: true,
            resolution: 'dismissed',
        }));
        expect(ctx.previousFindingsBlock).not.toContain('manual');
    });

    it('does not infer dismissal when Bugbot itself resolved the native thread', async () => {
        mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([50]);
        mockListPullRequestReviewComments.mockResolvedValue([
            {
                id: 200,
                identity: 'PRRC_partial',
                authorLogin: 'vypbot',
                body: marker('partial', false),
            },
        ]);
        mockListPullRequestReviewThreadStates.mockResolvedValue({
            PRRC_partial: { resolved: true, resolvedByLogin: 'vypbot[bot]' },
        });
        const ctx = await loadBugbotContext(baseParam({ tokenUser: 'vypbot' }));
        expect(ctx.existingByFindingId.partial?.pullRequest).toEqual(
            expect.objectContaining({
                resolved: false,
                verificationRequired: true,
            }),
        );
        expect(ctx.previousFindingsBlock).toContain('partial');
    });

    it("truncates fullBody to 12000 chars when loading from issue comments and appends truncation indicator", async () => {
        const longBody =
            `## Finding\n\n${"x".repeat(15000)}\n\n${marker('long-1', false)}`;
        mockListIssueComments.mockResolvedValue([
            {
                id: 100,
                user: { login: "vypbot" },
                body: longBody,
            },
        ]);

        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.unresolvedFindingsWithBody).toHaveLength(1);
        expect(ctx.unresolvedFindingsWithBody[0].id).toBe("long-1");
        expect(ctx.unresolvedFindingsWithBody[0].fullBody).toContain("[... truncated for length ...]");
        expect(ctx.unresolvedFindingsWithBody[0].fullBody.length).toBeLessThanOrEqual(12000);
    });

    it("keeps full mutation bodies and independent destination state after a partial resolution", async () => {
        const longBody =
            `## Finding\n\n${"x".repeat(15000)}\n\n${marker('partial-1', false)}`;
        mockListIssueComments.mockResolvedValue([{ id: 100, user: { login: "vypbot" }, body: longBody }]);
        mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([50]);
        mockListPullRequestReviewComments.mockResolvedValue([
            {
                id: 200,
                identity: "PRRC_partial_1",
                authorLogin: "vypbot",
                body: `## Finding\n\n${marker('partial-1', true)}`,
            },
        ]);

        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.issueComments[0].body).toBe(longBody);
        expect(ctx.existingByFindingId["partial-1"]).toEqual({
            issue: { commentId: 100, resolved: false, fingerprint: 'fp-11111111', semanticFingerprint: 'sf-11111111' },
            pullRequest: {
                commentIdentity: "PRRC_partial_1",
                pullRequestNumber: 50,
                resolved: true,
                fingerprint: 'fp-11111111',
                semanticFingerprint: 'sf-11111111',
            },
        });
        expect(ctx.previousFindingsBlock).toContain("partial-1");
        expect(ctx.unresolvedFindingsWithBody[0].fullBody).toContain(
            "[... truncated for length ...]",
        );
    });

    it('bounds the previous-findings context sent to the agent', async () => {
        mockListIssueComments.mockResolvedValue(
            Array.from({ length: 120 }, (_, index) => ({
                id: index + 1,
                user: { login: "vypbot" },
                body: `## Finding ${index}\n\n${'x'.repeat(700)}\n\n${marker(`finding-${index}`, false)}`,
            })),
        );

        const ctx = await loadBugbotContext(baseParam());

        expect(ctx.unresolvedFindingsWithBody.length).toBeLessThan(120);
        expect(ctx.previousFindingsBlock.length).toBeLessThanOrEqual(48_000 + 500);
        expect(ctx.previousFindingsBlock).toContain('older finding(s) were omitted');
    });
});
