/**
 * Unit tests for DetectBugbotFixIntentUseCase: skip conditions, branch override, parent comment, OpenCode response.
 */

import { DetectBugbotFixIntentUseCase } from "../detect_bugbot_fix_intent_use_case";
import type { Execution } from "../../../../../../data/model/execution";
import { Result } from "../../../../../../data/model/result";

jest.mock("../../../../../../utils/logger", () => ({
    logInfo: jest.fn(),
    logDebugInfo: jest.fn(),
}));

const mockLoadBugbotContext = jest.fn();
const mockAskAgent = jest.fn();
const mockGetHeadBranchForIssue = jest.fn();
const mockGetPullRequestReviewCommentBody = jest.fn();

jest.mock("../load_bugbot_context_use_case", () => ({
    loadBugbotContext: (...args: unknown[]) => mockLoadBugbotContext(...args),
}));


function baseExecution(overrides: Partial<Execution> = {}): Execution {
    return {
        owner: "o",
        repo: "r",
        issueNumber: 42,
        tokens: { token: "t" },
        commit: { branch: "feature/42-foo" },
        issue: {
            isIssueComment: true,
            isIssue: false,
            commentBody: "@bot fix it",
            number: 42,
            commentId: 1,
        },
        pullRequest: { isPullRequestReviewComment: false, commentBody: "", number: 0 },
        ai: { getAgentConfiguration: () => ({ provider: 'opencode', model: 'model', command: 'opencode run' }) },
        ...overrides,
    } as unknown as Execution;
}

function mockContextWithUnresolved(count = 1) {
    const unresolved = Array.from({ length: count }, (_, i) => ({
        id: `finding-${i}`,
        fullBody: `## Finding ${i}\n\nBody for ${i}.`,
    }));
    return {
        existingByFindingId: {} as Record<string, { resolved: boolean }>,
        issueComments: [],
        openPrNumbers: [],
        previousFindingsBlock: "",
        prContext: null,
        unresolvedFindingsWithBody: unresolved,
    };
}

describe("DetectBugbotFixIntentUseCase", () => {
    let useCase: DetectBugbotFixIntentUseCase;

    beforeEach(() => {
        const issuePort = { listIssueComments: jest.fn() };
        const pullRequestPort = {
            getHeadBranchForIssue: mockGetHeadBranchForIssue,
            getPullRequestReviewCommentBody: mockGetPullRequestReviewCommentBody,
            getOpenPullRequestNumbersByHeadBranch: jest.fn(),
            listPullRequestReviewComments: jest.fn(),
            getPullRequestHeadSha: jest.fn(),
            getChangedFiles: jest.fn(),
            getFilesWithFirstDiffLine: jest.fn(),
        };
        useCase = new DetectBugbotFixIntentUseCase(
            pullRequestPort,
            { query: (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => mockAskAgent(request.configuration, request.agentId, request.prompt, request.options) },
            { issue: issuePort, pullRequest: pullRequestPort },
        );
        mockLoadBugbotContext.mockReset();
        mockAskAgent.mockReset();
        mockGetHeadBranchForIssue.mockReset();
        mockGetPullRequestReviewCommentBody.mockReset();
    });

    it("returns empty results when OpenCode not configured", async () => {
        const param = baseExecution({
            ai: { getAgentConfiguration: () => ({ provider: 'opencode', model: '' }) } as unknown as Execution["ai"],
        });

        const results = await useCase.invoke(param);

        expect(results).toEqual([]);
        expect(mockLoadBugbotContext).not.toHaveBeenCalled();
    });

    it("returns empty results when issueNumber is -1", async () => {
        const results = await useCase.invoke(baseExecution({ issueNumber: -1 }));

        expect(results).toEqual([]);
        expect(mockLoadBugbotContext).not.toHaveBeenCalled();
    });

    it("returns empty results when comment body is empty", async () => {
        const results = await useCase.invoke(
            baseExecution({ issue: { ...baseExecution().issue, commentBody: "" } } as Partial<Execution>)
        );

        expect(results).toEqual([]);
        expect(mockLoadBugbotContext).not.toHaveBeenCalled();
    });

    it("returns empty results when no branch and getHeadBranchForIssue returns null", async () => {
        mockGetHeadBranchForIssue.mockResolvedValue(undefined);
        mockLoadBugbotContext.mockResolvedValue(mockContextWithUnresolved(1));

        const results = await useCase.invoke(
            baseExecution({ commit: { branch: "" } } as Partial<Execution>)
        );

        expect(mockGetHeadBranchForIssue).toHaveBeenCalledWith("o", "r", 42, "t");
        expect(results).toEqual([]);
    });

    it("uses branchOverride when commit.branch empty and getHeadBranchForIssue returns branch", async () => {
        mockGetHeadBranchForIssue.mockResolvedValue("feature/42-pr");
        mockLoadBugbotContext.mockResolvedValue(mockContextWithUnresolved(1));
        mockAskAgent.mockResolvedValue({ is_fix_request: false, target_finding_ids: [], is_do_request: false });

        await useCase.invoke(baseExecution({ commit: { branch: "" } } as Partial<Execution>));

        expect(mockLoadBugbotContext).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ branchOverride: "feature/42-pr" }),
            expect.objectContaining({ issue: expect.anything(), pullRequest: expect.anything() })
        );
    });

    it("returns empty results when no unresolved findings", async () => {
        mockLoadBugbotContext.mockResolvedValue(mockContextWithUnresolved(0));

        const results = await useCase.invoke(baseExecution());

        expect(results).toEqual([]);
        expect(mockAskAgent).not.toHaveBeenCalled();
    });

    it("calls askAgent and returns payload with filtered target ids", async () => {
        const context = mockContextWithUnresolved(2);
        mockLoadBugbotContext.mockResolvedValue(context);
        mockAskAgent.mockResolvedValue({
            is_fix_request: true,
            target_finding_ids: ["finding-0", "finding-1", "invalid-id"],
            is_do_request: false,
        });

        const results = await useCase.invoke(baseExecution());

        expect(mockAskAgent).toHaveBeenCalledTimes(1);
        expect(results).toHaveLength(1);
        const payload = results[0].payload as { isFixRequest: boolean; isDoRequest: boolean; targetFindingIds: string[] };
        expect(payload.isFixRequest).toBe(true);
        expect(payload.isDoRequest).toBe(false);
        expect(payload.targetFindingIds).toEqual(["finding-0", "finding-1"]);
    });

    it('resolves an explicit fix command without calling the intent model', async () => {
        const context = mockContextWithUnresolved(2);
        mockLoadBugbotContext.mockResolvedValue(context);

        const results = await useCase.invoke(baseExecution({
            issue: { ...baseExecution().issue, commentBody: '/copilot fix finding-0' },
        } as Partial<Execution>));

        expect(mockAskAgent).not.toHaveBeenCalled();
        expect((results[0].payload as { targetFindingIds: string[] }).targetFindingIds).toEqual(['finding-0']);
    });

    it('supports selecting all unresolved findings with an explicit command', async () => {
        mockLoadBugbotContext.mockResolvedValue(mockContextWithUnresolved(2));

        const results = await useCase.invoke(baseExecution({
            issue: { ...baseExecution().issue, commentBody: '/copilot fix all' },
        } as Partial<Execution>));

        expect(mockAskAgent).not.toHaveBeenCalled();
        expect((results[0].payload as { targetFindingIds: string[] }).targetFindingIds).toEqual(['finding-0', 'finding-1']);
    });

    it("returns no response payload when askAgent returns null", async () => {
        mockLoadBugbotContext.mockResolvedValue(mockContextWithUnresolved(1));
        mockAskAgent.mockResolvedValue(null);

        const results = await useCase.invoke(baseExecution());

        expect(results).toHaveLength(1);
        expect((results[0].payload as { isFixRequest: boolean; isDoRequest: boolean }).isFixRequest).toBe(false);
        expect((results[0].payload as { isDoRequest: boolean }).isDoRequest).toBe(false);
    });

    it("fetches parent comment body when PR review comment has commentInReplyToId", async () => {
        mockLoadBugbotContext.mockResolvedValue(mockContextWithUnresolved(1));
        mockGetPullRequestReviewCommentBody.mockResolvedValue("Parent body");
        mockAskAgent.mockResolvedValue({ is_fix_request: false, target_finding_ids: [], is_do_request: false });

        await useCase.invoke(
            baseExecution({
                issue: { ...baseExecution().issue, isIssueComment: false },
                pullRequest: {
                    isPullRequestReviewComment: true,
                    commentBody: "fix it",
                    number: 50,
                    commentInReplyToId: 999,
                },
            } as Partial<Execution>)
        );

        expect(mockGetPullRequestReviewCommentBody).toHaveBeenCalledWith("o", "r", 50, 999, "t");
        expect(mockAskAgent).toHaveBeenCalledWith(
            expect.anything(),
            "build",
            expect.stringContaining("Parent body"),
            expect.anything()
        );
    });

    it("handles unresolved findings with undefined fullBody without throwing", async () => {
        const contextWithUndefinedFullBody = {
            ...mockContextWithUnresolved(0),
            unresolvedFindingsWithBody: [
                { id: "finding-no-body" },
                { id: "finding-with-body", fullBody: "## Title\n\nContent." },
            ] as Array<{ id: string; fullBody?: string }>,
        };
        mockLoadBugbotContext.mockResolvedValue(contextWithUndefinedFullBody);
        mockAskAgent.mockResolvedValue({
            is_fix_request: false,
            target_finding_ids: [],
            is_do_request: false,
        });

        const results = await useCase.invoke(baseExecution());

        expect(mockAskAgent).toHaveBeenCalledTimes(1);
        const prompt = mockAskAgent.mock.calls[0]?.[2];
        expect(typeof prompt).toBe("string");
        expect(prompt).toContain("finding-no-body");
        expect(prompt).toContain("finding-with-body");
        expect(results).toHaveLength(1);
    });
});
