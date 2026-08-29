/**
 * Unit tests for DoUserRequestUseCase: skip when no OpenCode/empty comment, copilotMessage call, success/failure.
 */

import { DoUserRequestUseCase } from "../user_request_use_case";

jest.mock("../../../../../utils/logger", () => ({
    logInfo: jest.fn(),
    logError: jest.fn(),
    logDebugInfo: jest.fn(),
}));

const mockCopilotMessage = jest.fn();


function baseExecution(overrides: Record<string, unknown> = {}) {
    return {
        owner: "o",
        repo: "r",
        issueNumber: 42,
        tokens: { token: "t" },
        commit: { branch: "feature/42-foo" },
        currentConfiguration: { parentBranch: "develop" },
        branches: { development: "develop" },
        ai: {
            getAgentConfiguration: (task: 'findings' | 'fixer') => ({
                provider: 'opencode',
                model: 'model',
                command: 'opencode run',
            }),
        },
        ...overrides,
    } as unknown as Parameters<DoUserRequestUseCase["invoke"]>[0]["execution"];
}

describe("DoUserRequestUseCase", () => {
    let useCase: DoUserRequestUseCase;

    beforeEach(() => {
        useCase = new DoUserRequestUseCase({ fix: (request: { configuration: unknown; prompt: string }) => mockCopilotMessage(request.configuration, request.prompt) });
        mockCopilotMessage.mockReset();
    });

    it("returns empty results when OpenCode not configured", async () => {
        const exec = baseExecution();
        (exec as { ai?: { getAgentConfiguration: (task: 'findings' | 'fixer') => { provider: 'opencode'; model: string; command?: string } } }).ai = {
            getAgentConfiguration: () => ({ provider: 'opencode', model: 'model', command: '' }),
        };

        const results = await useCase.invoke({
            execution: exec,
            userComment: "add a test for login",
        });

        expect(results).toEqual([]);
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("returns empty results when user comment is empty", async () => {
        const results = await useCase.invoke({
            execution: baseExecution(),
            userComment: "   ",
        });

        expect(results).toEqual([]);
        expect(mockCopilotMessage).not.toHaveBeenCalled();
    });

    it("returns failure when copilotMessage returns no text", async () => {
        mockCopilotMessage.mockResolvedValue({ text: undefined });

        const results = await useCase.invoke({
            execution: baseExecution(),
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
            execution: baseExecution(),
            userComment: "add a unit test for foo",
            branchOverride: "feature/42-from-pr",
        });

        expect(results).toHaveLength(1);
        expect(results[0].success).toBe(true);
        expect(results[0].executed).toBe(true);
        expect(results[0].payload).toEqual({ branchOverride: "feature/42-from-pr" });
        expect(mockCopilotMessage).toHaveBeenCalledTimes(1);
        const prompt = mockCopilotMessage.mock.calls[0][1];
        expect(prompt).toContain("add a unit test for foo");
        expect(prompt).toContain("Owner: o");
        expect(prompt).toContain("Repository: r");
    });

    it("uses branches.development as base branch when parentBranch is undefined", async () => {
        mockCopilotMessage.mockResolvedValue({ text: "Done." });
        const exec = baseExecution({
            currentConfiguration: { parentBranch: undefined },
            branches: { development: "main" },
        });

        await useCase.invoke({
            execution: exec,
            userComment: "add a readme",
        });

        const prompt = mockCopilotMessage.mock.calls[0][1];
        expect(prompt).toContain("Base branch: main");
    });

    it("uses develop as base branch when parentBranch and branches.development are missing", async () => {
        mockCopilotMessage.mockResolvedValue({ text: "Done." });
        const exec = baseExecution({
            currentConfiguration: {},
            branches: {},
        });

        await useCase.invoke({
            execution: exec,
            userComment: "add a readme",
        });

        const prompt = mockCopilotMessage.mock.calls[0][1];
        expect(prompt).toContain("Base branch: develop");
    });
});
