/**
 * Unit tests for BugbotAutofixUseCase: skip when no targets/OpenCode, context load vs provided, copilotMessage call.
 */

import { BugbotAutofixUseCase } from "../bugbot_autofix_use_case";
import { GitCommitAdapter } from "../../../../../../infrastructure/git_commit_adapter";
import type { BugbotContext } from "../types";

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
            body: `## Finding ${id}\n\nDescription.\n\n<!-- copilot-bugbot finding_id:"${id}" resolved:false -->`,
        });
    });
    return {
        existingByFindingId,
        issueComments,
        openPrNumbers: [] as number[],
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
                issue: { listIssueComments: jest.fn() },
                pullRequest: {
                    getHeadBranchForIssue: jest.fn(),
                    getPullRequestReviewCommentBody: jest.fn(),
                    getOpenPullRequestNumbersByHeadBranch: jest.fn(),
                    listPullRequestReviewComments: jest.fn(),
                    getPullRequestHeadSha: jest.fn(),
                    getChangedFiles: jest.fn(),
                    getFilesWithFirstDiffLine: jest.fn(),
                },
            },
            new GitCommitAdapter(),
        );
        mockLoadBugbotContext.mockReset();
        mockCopilotMessage.mockReset();
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

    it("uses provided context when passed", async () => {
        const ctx = contextWithFindings(["f1"]);
        mockCopilotMessage.mockResolvedValue({ text: "Done.", sessionId: "s1" });

        await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(mockLoadBugbotContext).not.toHaveBeenCalled();
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

    it("filters to only valid unresolved target ids", async () => {
        const ctx = contextWithFindings(["f1", "f2"]);
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
        mockCopilotMessage.mockResolvedValue({ text: "Fixed.", sessionId: "s1" });

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: ctx,
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);
        expect(results[0].payload).toEqual(
            expect.objectContaining({ targetFindingIds: ["f1"], workspacePaths: ["src/fix.ts"] })
        );
    });

    it("refuses to run when the workspace was already dirty", async () => {
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
            context: contextWithFindings(["f1"]),
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("workspace is not clean");
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("returns a controlled failure when the workspace cannot be inspected before the agent", async () => {
        mockExec.mockRejectedValueOnce("status unavailable");

        const results = await useCase.invoke({
            execution: baseExecution(),
            targetFindingIds: ["f1"],
            userComment: "fix it",
            context: contextWithFindings(["f1"]),
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("Unable to inspect workspace before autofix: status unavailable");
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("refuses the autofix when OpenCode modifies a sensitive path", async () => {
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
            context: contextWithFindings(["f1"]),
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("sensitive files were modified");
    });

    it("returns a controlled failure when the workspace cannot be inspected after the agent", async () => {
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
            context: contextWithFindings(["f1"]),
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("Unable to inspect workspace after autofix: status unavailable");
    });

    it("refuses to report success when the agent changes no workspace paths", async () => {
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
            context: contextWithFindings(["f1"]),
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].errors?.[0].message).toContain("no safe workspace paths");
    });
});
