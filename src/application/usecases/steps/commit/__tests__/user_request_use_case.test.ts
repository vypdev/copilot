/**
 * Unit tests for DoUserRequestUseCase: skip when no OpenCode/empty comment, copilotMessage call, success/failure.
 */

import { DoUserRequestUseCase } from "../user_request_use_case";
import type { BugbotGitMutationPort } from '../../../../ports/bugbot_git_ports';

jest.mock("../../../../../utils/logger", () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logDebugInfo: jest.fn(),
}));

const mockCopilotMessage = jest.fn();
const mockGitExecute = jest.fn();
const mockGitFetch = jest.fn();


function baseContext(overrides: Record<string, unknown> = {}) {
    return {
        issueNumber: 42,
        headBranch: "feature/42-foo",
        baseBranch: "develop",
        repository: { owner: 'o', name: 'r' },
        agentConfiguration: { provider: 'opencode', model: 'model' },
        ...overrides,
    } as Parameters<DoUserRequestUseCase["invoke"]>[0]["context"];
}

describe("DoUserRequestUseCase", () => {
    let useCase: DoUserRequestUseCase;

    beforeEach(() => {
        let statusCalls = 0;
        mockGitExecute.mockReset();
        mockGitFetch.mockReset();
        mockGitExecute.mockImplementation(async (_program: string, args: string[], options?: { stdout?: (data: Buffer) => void }) => {
            if (args[0] === 'status') {
                statusCalls += 1;
                options?.stdout?.(Buffer.from(statusCalls >= 4 ? ' M src/changed.ts\n' : ''));
            }
            return 0;
        });
        const gitCommitPort: BugbotGitMutationPort = {
            execute: mockGitExecute,
            getAuthenticatedUserDetails: jest.fn(),
            configureAuthor: jest.fn(),
            fetch: mockGitFetch,
            stageAll: jest.fn(),
            stagePaths: jest.fn(),
            commit: jest.fn(),
            push: jest.fn(),
        };
        useCase = new DoUserRequestUseCase(
            { fix: (request: { configuration: unknown; prompt: string }) => mockCopilotMessage(request.configuration, request.prompt) },
            gitCommitPort,
        );
        mockCopilotMessage.mockReset();
    });

    it("returns empty results when OpenCode not configured", async () => {
        const context = baseContext({ agentConfiguration: { provider: 'opencode', model: '' } });

        const results = await useCase.invoke({
            context,
            userComment: "add a test for login",
        });

        expect(results).toEqual([]);
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("returns empty results when user comment is empty", async () => {
        const results = await useCase.invoke({
            context: baseContext(),
            userComment: "   ",
        });

        expect(results).toEqual([]);
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("returns failure when copilotMessage returns no text", async () => {
        mockCopilotMessage.mockResolvedValue({ text: undefined });

        const results = await useCase.invoke({
            context: baseContext(),
            userComment: "add a unit test for foo",
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(false);
        expect(results[0].executed).toBe(true);
        expect(results[0].errors.map((error) => error.message)).toContain("Configured build agent returned no response.");
        expect(mockCopilotMessage).toHaveBeenCalledTimes(1);
    });

    it("returns success and payload when copilotMessage returns text", async () => {
        mockCopilotMessage.mockResolvedValue({ text: "Added unit test for foo." });

        const results = await useCase.invoke({
            context: baseContext(),
            userComment: "add a unit test for foo",
            branchOverride: "feature/42-from-pr",
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);
        expect(results[0].executed).toBe(true);
        expect(results[0].payload).toEqual({
            branchOverride: "feature/42-from-pr",
            branchCheckedOut: true,
            workspacePaths: ['src/changed.ts'],
        });
        expect(mockCopilotMessage).toHaveBeenCalledTimes(1);
        const prompt = mockCopilotMessage.mock.calls[0][1];
        expect(prompt).toContain("add a unit test for foo");
        expect(prompt).toContain("Owner: o");
        expect(prompt).toContain("Repository: r");
        expect(mockGitFetch).toHaveBeenCalledWith('feature/42-from-pr');
        expect(mockGitExecute).toHaveBeenCalledWith('git', ['checkout', 'feature/42-from-pr']);
    });

    it('refuses to invoke the agent when the workspace is dirty', async () => {
        mockGitExecute.mockImplementation(async (_program: string, args: string[], options?: { stdout?: (data: Buffer) => void }) => {
            if (args[0] === 'status') options?.stdout?.(Buffer.from(' M existing.ts\n'));
            return 0;
        });

        const results = await useCase.invoke({
            context: baseContext(),
            userComment: 'change the implementation',
        });

        expect(results[0].success).toBe(false);
        expect(results[0].errors[0].message).toContain('workspace is not clean');
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it('refuses sensitive paths produced by the agent', async () => {
        let statusCalls = 0;
        mockGitExecute.mockImplementation(async (_program: string, args: string[], options?: { stdout?: (data: Buffer) => void }) => {
            if (args[0] === 'status') {
                statusCalls += 1;
                options?.stdout?.(Buffer.from(statusCalls >= 4 ? '?? .env\n' : ''));
            }
            return 0;
        });
        mockCopilotMessage.mockResolvedValue({ text: 'Done.' });

        const results = await useCase.invoke({
            context: baseContext(),
            userComment: 'change configuration',
        });

        expect(results[0].success).toBe(false);
        expect(results[0].errors[0].message).toContain('sensitive files were modified');
    });

    it("uses branches.development as base branch when parentBranch is undefined", async () => {
        mockCopilotMessage.mockResolvedValue({ text: "Done." });
        const context = baseContext({ baseBranch: 'main' });

        await useCase.invoke({
            context,
            userComment: "add a readme",
        });

        const prompt = mockCopilotMessage.mock.calls[0][1];
        expect(prompt).toContain("Base branch: main");
    });

    it("uses develop as base branch when parentBranch and branches.development are missing", async () => {
        mockCopilotMessage.mockResolvedValue({ text: "Done." });
        const context = baseContext({ baseBranch: 'develop' });

        await useCase.invoke({
            context,
            userComment: "add a readme",
        });

        const prompt = mockCopilotMessage.mock.calls[0][1];
        expect(prompt).toContain("Base branch: develop");
    });
});
