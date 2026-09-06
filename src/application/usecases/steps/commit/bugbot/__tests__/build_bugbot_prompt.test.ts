/**
 * Unit tests for buildBugbotPrompt (detect potential problems prompt).
 */

import type { Execution } from "../../../../../../data/model/execution";
import type { BugbotContext } from "../types";
import { buildBugbotPrompt } from "../build_bugbot_prompt";

function mockExecution(overrides: Partial<Execution> = {}): Execution {
    return {
        owner: "o",
        repo: "r",
        issueNumber: 42,
        commit: { branch: "feature/42-branch" },
        currentConfiguration: { parentBranch: "develop" },
        branches: { development: "develop" },
        ai: undefined,
        ...overrides,
    } as unknown as Execution;
}

function mockContext(overrides: Partial<BugbotContext> = {}): BugbotContext {
    return {
        previousFindingsBlock: "",
        ...overrides,
    } as BugbotContext;
}

describe("buildBugbotPrompt", () => {
    it("includes repo context and task instructions", () => {
        const prompt = buildBugbotPrompt(mockExecution(), mockContext());
        expect(prompt).toContain("o");
        expect(prompt).toContain("r");
        expect(prompt).toContain("feature/42-branch");
        expect(prompt).toContain("develop");
        expect(prompt).toContain("findings");
        expect(prompt).toContain("resolved_finding_ids");
    });

    it("includes ignore patterns when getAiIgnoreFiles returns patterns", () => {
        const prompt = buildBugbotPrompt(
            mockExecution({ ai: { getAiIgnoreFiles: () => ["*.test.ts", "build/*"] } } as unknown as Partial<Execution>),
            mockContext()
        );
        expect(prompt).toContain("Files to ignore");
        expect(prompt).toContain("*.test.ts");
        expect(prompt).toContain("build/*");
    });

    it("truncates ignore block when total length exceeds limit", () => {
        const longPatterns = Array.from({ length: 100 }, (_, i) => `pattern-${i}-${"x".repeat(50)}`);
        const prompt = buildBugbotPrompt(
            mockExecution({ ai: { getAiIgnoreFiles: () => longPatterns } } as unknown as Partial<Execution>),
            mockContext()
        );
        expect(prompt).toContain("Files to ignore");
        expect(prompt.length).toBeLessThan(15000);
        expect(prompt).toContain("...");
    });

    it("omits ignore block when getAiIgnoreFiles returns empty", () => {
        const prompt = buildBugbotPrompt(
            mockExecution({ ai: { getAiIgnoreFiles: () => [] } } as unknown as Partial<Execution>),
            mockContext()
        );
        expect(prompt).not.toContain("Files to ignore");
    });

    it("uses branches.development as base branch when parentBranch is undefined", () => {
        const prompt = buildBugbotPrompt(
            mockExecution({
                currentConfiguration: {},
                branches: { development: "main" },
            } as unknown as Partial<Execution>),
            mockContext()
        );
        expect(prompt).toContain("- Base branch: main");
    });

    it('uses the actual pull-request head branch instead of the synthetic Actions ref', () => {
        const prompt = buildBugbotPrompt(mockExecution({
            commit: { branch: 'refs/pull/42/merge' },
            pullRequest: { head: 'feature/42-real-head' },
        } as unknown as Partial<Execution>), mockContext());
        expect(prompt).toContain('feature/42-real-head');
        expect(prompt).not.toContain('refs/pull/42/merge');
    });

    it('scopes synchronized pull request analysis to the newly pushed commit range', () => {
        const before = 'a'.repeat(40);
        const after = 'b'.repeat(40);
        const prompt = buildBugbotPrompt(mockExecution({
            inputs: { eventName: 'pull_request', action: 'synchronize', before, after },
            pullRequest: { action: 'synchronize', head: 'feature/42-real-head' },
        } as unknown as Partial<Execution>), mockContext());

        expect(prompt).toContain(`exact local commit range \`${before}..${after}\``);
        expect(prompt).toContain('do not re-review its unchanged remainder');
        expect(prompt).toContain('Task 2 is not limited to this range');
    });

    it('falls back to a full branch review when synchronize SHAs are unavailable or unsafe', () => {
        const prompt = buildBugbotPrompt(mockExecution({
            inputs: { eventName: 'pull_request', action: 'synchronize', before: '$(unsafe)', after: 'b'.repeat(40) },
            pullRequest: { action: 'synchronize', head: 'feature/42-real-head' },
        } as unknown as Partial<Execution>), mockContext());

        expect(prompt).toContain('Review the canonical pull-request diff for "feature/42-real-head" compared to "develop"');
        expect(prompt).not.toContain('$(unsafe)');
    });

    it("uses develop when parentBranch and branches.development are missing", () => {
        const prompt = buildBugbotPrompt(
            mockExecution({
                currentConfiguration: {},
                branches: {},
            } as unknown as Partial<Execution>),
            mockContext()
        );
        expect(prompt).toContain("- Base branch: develop");
    });
});
