/**
 * Unit tests for BugbotAutofixUseCase: skip when no targets/OpenCode, context load vs provided, copilotMessage call.
 */

import { BugbotAutofixUseCase } from "../bugbot_autofix_use_case";
import { GitCommitAdapter } from "../../../../../../infrastructure/git_commit_adapter";
import type { BugbotContext } from "../types";
import { buildMarker } from '../../../../../policies/bugbot_finding_marker_policy';

const mockExec = jest.fn();
let workspaceInspectionCount = 0;
jest.mock("@actions/exec", () => ({
    exec: (...args: unknown[]) => mockExec(...args),
}));

jest.mock("../../../../../../utils/logger", () => ({
    logInfo: jest.fn(),
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

const mockLoadBugbotContext = jest.fn();
const mockCopilotMessage = jest.fn();

jest.mock("../load_bugbot_context_use_case", () => ({
    loadBugbotContext: (...args: unknown[]) => mockLoadBugbotContext(...args),
}));


function baseExecution() {
    return {
        owner: "o",
        repo: "r",
        issueNumber: 42,
        tokens: { token: "t" },
        commit: { branch: "feature/42-foo" },
        currentConfiguration: { parentBranch: "develop" },
        branches: { development: "develop" },
        ai: {
            getAgentConfiguration: () => ({ provider: 'opencode', model: 'model', command: 'opencode run' }),
            getBugbotFixVerifyCommands: () => ["pnpm test"],
            getBugbotReviewConfiguration: () => ({ organizationRules: [] }),
            getAiIgnoreFiles: () => [],
        },
    } as unknown as Parameters<BugbotAutofixUseCase["invoke"]>[0]["execution"];
}

function contextWithFindings(ids: string[]) {
    const existingByFindingId: BugbotContext["existingByFindingId"] = {};
    const issueComments: BugbotContext["issueComments"] = [];
    ids.forEach((id, i) => {
        existingByFindingId[id] = {
            issue: { commentId: 100 + i, resolved: false },
        };
        issueComments.push({
            id: 100 + i,
            body: `## Finding ${id}\n\nDescription.\n\n${buildMarker(id, false, 'fp-11111111', 'sf-11111111')}`,
        });
    });
    return {
        existingByFindingId,
        issueComments,
        canonicalPullRequest: {
            number: 50,
            state: 'open',
            baseRepository: { owner: 'o', name: 'r' },
            headRepositoryOwner: 'o',
            headRef: 'feature/42-foo',
            headSha: 'a'.repeat(40),
        },
        selectionReason: 'exact-head',
        coverage: { status: 'complete', sources: [] },
        eligibleResolutionIds: new Set(ids),
        previousFindingsBlock: "",
        prContext: null,
        unresolvedFindingsWithBody: ids.map((id) => ({ id, fullBody: `Body ${id}` })),
    } as BugbotContext;
}

describe("BugbotAutofixUseCase", () => {
    let useCase: BugbotAutofixUseCase;

    beforeEach(() => {
        useCase = new BugbotAutofixUseCase(
            { fix: (request: { configuration: unknown; prompt: string }) => mockCopilotMessage(request.configuration, request.prompt) },
            {
                loader: { bind: jest.fn().mockReturnValue({}) },
                issue: { listIssueComments: jest.fn() },
                reviewState: { listPullRequestReviews: jest.fn().mockResolvedValue([]) },
                navigation: { forPullRequest: jest.fn() },
                rules: { loadRules: jest.fn().mockResolvedValue([]) },
                pullRequest: {
                    getPullRequestReviewCommentBody: jest.fn(),
                    listPullRequestReviewComments: jest.fn(),
                    getPullRequestHeadSha: jest.fn(),
                    getReviewDiffSnapshot: jest.fn().mockResolvedValue({
                        changes: [],
                        filesWithFirstDiffLine: [],
                        filesWithDiffLocations: [],
                    }),
                    listPullRequestReviewThreadStates: jest.fn().mockResolvedValue({}),
                },
            },
            new GitCommitAdapter(),
        );
        mockLoadBugbotContext.mockReset();
        mockCopilotMessage.mockReset();
        mockExec.mockReset();
        workspaceInspectionCount = 0;
        mockExec.mockImplementation(
            async (_command: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
                workspaceInspectionCount += 1;
                options?.listeners?.stdout?.(
                    Buffer.from(workspaceInspectionCount === 1 ? "" : " M src/fix.ts\n")
                );
                return 0;
            }
        );
    });

    it("returns empty results when targetFindingIds is empty", async () => {
        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: [],
            userComment: "fix it",
        });

        expect(results).toEqual([]);
        expect(mockLoadBugbotContext).not.toHaveBeenCalled();
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("returns empty results when OpenCode not configured", async () => {
        const exec = baseExecution();
        (exec as { ai?: unknown }).ai = {
            getAgentConfiguration: () => ({ provider: 'opencode', model: 'model', command: '' }),
            getBugbotFixVerifyCommands: () => ["pnpm test"],
        };

        const results = await useCase.invoke({
            execution: exec,
            targetFindingIds: ["f1"],
            userComment: "fix it",
        });

        expect(results).toEqual([]);
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("revalidates provided context before workspace mutation", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockCopilotMessage.mockResolvedValue({ text: "Done.", sessionId: "s1" });

        await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(mockLoadBugbotContext).toHaveBeenCalledTimes(1);
        expect(mockCopilotMessage).toHaveBeenCalledTimes(1);
    });

    it("loads context when not provided", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockCopilotMessage.mockResolvedValue({ text: "Done.", sessionId: "s1" });

        await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
        });

        expect(mockLoadBugbotContext).toHaveBeenCalledTimes(1);
        expect(mockCopilotMessage).toHaveBeenCalledTimes(1);
    });

    it('stops before workspace inspection when canonical context revalidation fails', async () => {
        mockLoadBugbotContext.mockRejectedValue(new Error('stale pull request'));

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ['f1'],
            userComment: 'fix it',
            context: contextWithFindings(['f1']),
        });

        expect(results).toHaveLength(1);
        expect(results[0]).toEqual(expect.objectContaining({ success: false, executed: true }));
        expect(results[0].errors[0].message).toBe('Bugbot autofix context validation failed.');
        expect(mockExec).not.toHaveBeenCalled();
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("filters to only valid unresolved target ids", async () => {
        const ctx = contextWithFindings(["f1", "f2"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockCopilotMessage.mockResolvedValue({ text: "Done.", sessionId: "s1" });

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1", "f2", "nonexistent"],
            userComment: "fix all",
            context: ctx,
        });

        expect(results).toHaveLength(1);
        expect((results[0].payload as { targetFindingIds: string[] }).targetFindingIds).toEqual([
            "f1",
            "f2",
        ]);
    });

    it("returns empty results when all target findings are already resolved", async () => {
        const ctx = contextWithFindings(["f1", "f2"]);
        ctx.existingByFindingId["f1"]!.issue!.resolved = true;
        ctx.existingByFindingId["f2"]!.issue!.resolved = true;
        mockLoadBugbotContext.mockResolvedValue(ctx);

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1", "f2"],
            userComment: "fix all",
            context: ctx,
        });

        expect(results).toEqual([]);
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("returns failure when copilotMessage returns no text", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockCopilotMessage.mockResolvedValue(null);

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors).toBeDefined();
    });

    it("returns success and payload when copilotMessage returns text", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockCopilotMessage.mockResolvedValue({ text: "Fixed.", sessionId: "s1" });

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);
        expect(results[0].steps).toEqual([
            "Bugbot autofix completed. The configured agent applied changes for findings: f1. Run verify commands and commit/push.",
        ]);
        expect(results[0].payload).toEqual(
            expect.objectContaining({ targetFindingIds: ["f1"], workspacePaths: ["src/fix.ts"] })
        );
    });

    it("refuses to run when the workspace was already dirty", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockExec.mockImplementationOnce(
            async (_command: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
                options?.listeners?.stdout?.(Buffer.from(" M preexisting.ts\n"));
                return 0;
            }
        );

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("workspace is not clean");
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("returns a controlled failure when the workspace cannot be inspected before the agent", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockExec.mockRejectedValueOnce("status unavailable");

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("Unable to inspect workspace before Bugbot autofix.");
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("refuses the autofix when OpenCode modifies a sensitive path", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockExec
            .mockImplementationOnce(
                async (_command: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
                    options?.listeners?.stdout?.(Buffer.from(""));
                    return 0;
                }
            )
            .mockImplementationOnce(
                async (_command: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
                    options?.listeners?.stdout?.(Buffer.from(" M src/fix.ts\n?? .env\n"));
                    return 0;
                }
            );
        mockCopilotMessage.mockResolvedValue({ text: "Fixed.", sessionId: "s1" });

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("sensitive files were modified");
    });

    it("returns a controlled failure when the workspace cannot be inspected after the agent", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockExec
            .mockImplementationOnce(
                async (_command: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
                    options?.listeners?.stdout?.(Buffer.from(""));
                    return 0;
                },
            )
            .mockRejectedValueOnce(new Error("status unavailable"));
        mockCopilotMessage.mockResolvedValue({ text: "Fixed.", sessionId: "s1" });

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("Unable to inspect workspace after Bugbot autofix.");
    });

    it("refuses to report success when the agent changes no workspace paths", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockLoadBugbotContext.mockResolvedValue(ctx);
        mockExec.mockImplementation(
            async (_command: string, _args: string[], options?: { listeners?: { stdout?: (data: Buffer) => void } }) => {
                options?.listeners?.stdout?.(Buffer.from(""));
                return 0;
            },
        );
        mockCopilotMessage.mockResolvedValue({ text: "No changes needed.", sessionId: "s1" });

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("no safe workspace paths");
    });
});
