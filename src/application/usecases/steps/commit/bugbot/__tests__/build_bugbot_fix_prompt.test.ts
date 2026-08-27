/**
 * Unit tests for buildBugbotFixPrompt.
 */

import type { Execution } from "../../../../../../data/model/execution";
import type { BugbotContext } from "../types";
import { buildBugbotFixPrompt } from "../build_bugbot_fix_prompt";

function mockExecution(overrides: Partial<Execution> = {}): Execution {
    return {
        owner: "test-owner",
        repo: "test-repo",
        issueNumber: 42,
        commit: { branch: "feature/42-branch" },
        currentConfiguration: { parentBranch: "develop" },
        branches: { development: "develop" },
        ai: undefined,
        ...overrides,
    } as Execution;
}

function mockContext(overrides: Partial<BugbotContext> = {}): BugbotContext {
    return {
        existingByFindingId: {
            "find-1": { issue: { commentId: 1, resolved: false } },
        },
        issueComments: [
            { id: 1, body: "## Null dereference\n\n**Location:** `src/foo.ts:10`\n\nDescription here." },
        ],
        openPrNumbers: [5],
        previousFindingsBlock: "",
        prContext: null,
        unresolvedFindingsWithBody: [
            { id: "find-1", fullBody: "## Null dereference\n\n**Location:** `src/foo.ts:10`\n\nDescription here." },
        ],
        ...overrides,
    };
}

describe("buildBugbotFixPrompt", () => {
    it("includes repo context, findings, user comment, and verify commands", () => {
        const param = mockExecution();
        const context = mockContext();
        const prompt = buildBugbotFixPrompt(
            param,
            context,
            ["find-1"],
            "please fix this",
            ["pnpm run build", "pnpm test"]
        );
        expect(prompt).toContain("test-owner");
        expect(prompt).toContain("test-repo");
        expect(prompt).toContain("feature/42-branch");
        expect(prompt).toContain("find-1");
        expect(prompt).toContain("please fix this");
        expect(prompt).toContain("pnpm run build");
        expect(prompt).toContain("pnpm test");
        expect(prompt).toContain("Fix only the problems described");
    });

    it("includes PR number when openPrNumbers is non-empty", () => {
        const prompt = buildBugbotFixPrompt(
            mockExecution(),
            mockContext(),
            ["find-1"],
            "fix it",
            []
        );
        expect(prompt).toContain("Pull request number: 5");
    });

    it("asks to run verify when verifyCommands is empty", () => {
        const prompt = buildBugbotFixPrompt(mockExecution(), mockContext(), ["find-1"], "fix", []);
        expect(prompt).toContain("Run any standard project checks");
    });

    it("truncates finding body when it exceeds 12000 characters and appends truncation indicator", () => {
        const longBody = "x".repeat(15000);
        const context = mockContext({
            unresolvedFindingsWithBody: [{ id: "find-1", fullBody: longBody }],
        });
        const prompt = buildBugbotFixPrompt(
            mockExecution(),
            context,
            ["find-1"],
            "fix",
            []
        );
        expect(prompt).toContain("find-1");
        expect(prompt).toContain("[... truncated for length ...]");
        const xCount = (prompt.match(/x/g) ?? []).length;
        expect(xCount).toBeLessThan(15000);
        expect(xCount).toBeLessThanOrEqual(12000);
    });

    it("escapes backticks in finding id so prompt block is not broken", () => {
        const context = mockContext({
            existingByFindingId: {
                "id-with`backtick": { issue: { commentId: 1, resolved: false } },
            },
            unresolvedFindingsWithBody: [
                { id: "id-with`backtick", fullBody: "## Finding\nBody." },
            ],
        });
        const prompt = buildBugbotFixPrompt(
            mockExecution(),
            context,
            ["id-with`backtick"],
            "fix",
            []
        );
        expect(prompt).toContain("id-with\\`backtick");
        expect(prompt).not.toMatch(/Finding id:\s*`[^`]*`[^`]*`/);
    });

    it("escapes backticks in verify commands so prompt block is not broken", () => {
        const prompt = buildBugbotFixPrompt(
            mockExecution(),
            mockContext(),
            ["find-1"],
            "fix",
            ["pnpm run test", "echo `whoami`"]
        );
        expect(prompt).toContain("echo \\`whoami\\`");
        expect(prompt).toContain("Verify commands");
    });

    it("uses branches.development as base branch when parentBranch is undefined", () => {
        const param = mockExecution({
            currentConfiguration: { parentBranch: undefined },
            branches: { development: "main" },
        } as Partial<Execution>);
        const prompt = buildBugbotFixPrompt(param, mockContext(), ["find-1"], "fix", []);
        expect(prompt).toContain("main");
    });

    it("skips findings not in existingByFindingId", () => {
        const context = mockContext();
        const prompt = buildBugbotFixPrompt(
            mockExecution(),
            context,
            ["find-1", "find-missing"],
            "fix",
            []
        );
        expect(prompt).toContain("find-1");
        expect(prompt).not.toContain("find-missing");
    });

    it("skips finding when the bounded prompt body is missing or empty", () => {
        const context = mockContext({
            unresolvedFindingsWithBody: [{ id: "find-1", fullBody: "   " }],
        });
        const prompt = buildBugbotFixPrompt(mockExecution(), context, ["find-1"], "fix", []);
        expect(prompt).not.toContain("find-1");
    });
});
