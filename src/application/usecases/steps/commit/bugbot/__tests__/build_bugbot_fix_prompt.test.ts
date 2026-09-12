/**
 * Unit tests for buildBugbotFixPrompt.
 */

import type { BugbotContext } from "../types";
import { buildBugbotFixPrompt } from "../build_bugbot_fix_prompt";
import type { BugbotAutofixOperationContext } from '../bugbot_review_operation_context';

function mockOperation(overrides: Partial<BugbotAutofixOperationContext> = {}): BugbotAutofixOperationContext {
    return {
        repository: { owner: 'test-owner', name: 'test-repo' },
        target: {
            issueNumber: 42,
            isPullRequest: true,
            pullRequestNumber: 5,
            headBranch: 'feature/42-branch',
            commitBranch: 'feature/42-branch',
            baseBranch: 'develop',
            pullRequestAction: 'synchronize',
            draft: false,
        },
        trigger: { kind: 'pull_request', headOwner: 'test-owner' },
        ignorePatterns: [],
        organizationRules: [],
        agentConfiguration: { provider: 'codex', model: 'model' },
        verifyCommands: [],
        ...overrides,
    };
}

function mockContext(overrides: Partial<BugbotContext> = {}): BugbotContext {
    return {
        existingByFindingId: {
            "find-1": { issue: { commentId: 1, resolved: false } },
        },
        issueComments: [
            { id: 1, body: "## Null dereference\n\n**Location:** `src/foo.ts:10`\n\nDescription here." },
        ],
        canonicalPullRequest: {
            number: 5,
            state: 'open',
            baseRepository: { owner: 'test-owner', name: 'test-repo' },
            headRepositoryOwner: 'test-owner',
            headRef: 'feature/42-branch',
            headSha: 'a'.repeat(40),
        },
        selectionReason: 'exact-head',
        coverage: { status: 'complete', sources: [] },
        eligibleResolutionIds: new Set(['find-1']),
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
        const param = mockOperation();
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
        expect(prompt).toContain('SECURITY POLICY:');
        expect(prompt).toContain('[BEGIN_UNTRUSTED_DATA origin=github.autofix-request');
        expect(prompt).toContain('[BEGIN_UNTRUSTED_DATA origin=bugbot.autofix.finding.find-1');
    });

    it("includes the canonical PR number", () => {
        const prompt = buildBugbotFixPrompt(
            mockOperation(),
            mockContext(),
            ["find-1"],
            "fix it",
            []
        );
        expect(prompt).toContain("Pull request number: 5");
    });

    it.each([
        ['commit branch', 'feature/from-commit', 'feature/from-commit'],
        ['unknown branch', '', 'unknown'],
    ])('uses the %s fallback without a canonical PR', (_case, commitBranch, expectedBranch) => {
        const operation = mockOperation({
            target: {
                ...mockOperation().target,
                headBranch: '',
                commitBranch,
            },
        });
        const prompt = buildBugbotFixPrompt(
            operation,
            mockContext({ canonicalPullRequest: null }),
            ['find-1'],
            'fix it',
            [],
        );

        expect(prompt).toContain(expectedBranch);
        expect(prompt).not.toContain('Pull request number:');
    });

    it("asks to run verify when verifyCommands is empty", () => {
        const prompt = buildBugbotFixPrompt(mockOperation(), mockContext(), ["find-1"], "fix", []);
        expect(prompt).toContain("Run any standard project checks");
    });

    it("truncates finding body when it exceeds 12000 characters and appends truncation indicator", () => {
        const longBody = "x".repeat(15000);
        const context = mockContext({
            unresolvedFindingsWithBody: [{ id: "find-1", fullBody: longBody }],
        });
        const prompt = buildBugbotFixPrompt(
            mockOperation(),
            context,
            ["find-1"],
            "fix",
            []
        );
        expect(prompt).toContain("find-1");
        expect(prompt).toContain("[untrusted content truncated]");
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
            mockOperation(),
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
            mockOperation(),
            mockContext(),
            ["find-1"],
            "fix",
            ["pnpm run test", "echo `whoami`"]
        );
        expect(prompt).toContain("echo \\`whoami\\`");
        expect(prompt).toContain("Verify commands");
    });

    it("uses branches.development as base branch when parentBranch is undefined", () => {
        const param = mockOperation({
            target: { ...mockOperation().target, baseBranch: 'main' },
        });
        const prompt = buildBugbotFixPrompt(param, mockContext(), ["find-1"], "fix", []);
        expect(prompt).toContain("main");
    });

    it("skips findings not in existingByFindingId", () => {
        const context = mockContext();
        const prompt = buildBugbotFixPrompt(
            mockOperation(),
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
        const prompt = buildBugbotFixPrompt(mockOperation(), context, ["find-1"], "fix", []);
        expect(prompt).not.toContain("find-1");
    });
});
