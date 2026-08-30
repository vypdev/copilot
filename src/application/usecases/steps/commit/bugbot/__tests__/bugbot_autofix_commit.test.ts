/**
 * Unit tests for runBugbotAutofixCommitAndPush: no branch, branchOverride checkout, verify commands, no changes, commit/push, git author.
 */

import * as exec from "@actions/exec";
import {
    runBugbotAutofixCommitAndPush as runBugbotAutofixCommitAndPushImpl,
    runUserRequestCommitAndPush as runUserRequestCommitAndPushImpl,
} from "../bugbot_autofix_commit";
import type { Execution } from "../../../../../../data/model/execution";
import { logInfo } from "../../../../../ports/logging_ports";
import { GitCommitAdapter } from "../../../../../../infrastructure/git_commit_adapter";

const shellQuoteParse = jest.fn();
jest.mock("shell-quote", () => ({
    parse: (s: string, opts?: unknown) => shellQuoteParse(s, opts),
}));

jest.mock("../../../../../ports/logging_ports", () => ({
    logInfo: jest.fn(),
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

const mockGetTokenUserDetails = jest.fn();
jest.mock("../../../../../../data/repository/organization/authenticated_user_repository", () => ({
    AuthenticatedUserRepository: jest.fn().mockImplementation(() => ({
        getTokenUserDetails: mockGetTokenUserDetails,
    })),
}));

const mockGetUserFromToken = jest.fn();
const authenticatedUserPort = { getTokenUserDetails: mockGetTokenUserDetails, getUserFromToken: mockGetUserFromToken };
const gitCommitPort = new GitCommitAdapter();

function runBugbotAutofixCommitAndPush(execution: Execution, options?: { branchOverride?: string; targetFindingIds?: string[]; workspacePaths?: string[] }) {
    return runBugbotAutofixCommitAndPushImpl(execution, options, authenticatedUserPort, gitCommitPort);
}

function runUserRequestCommitAndPush(execution: Execution, options?: { branchOverride?: string }) {
    return runUserRequestCommitAndPushImpl(execution, options, authenticatedUserPort, gitCommitPort);
}

const mockExec = jest.spyOn(exec, "exec") as jest.Mock;

type ExecCallback = (
    cmd: string,
    args?: string[],
    opts?: { listeners?: { stdout?: (d: Buffer) => void } }
) => Promise<number>;

function baseExecution(overrides: Partial<Execution> = {}): Execution {
    return {
        owner: "o",
        repo: "r",
        issueNumber: 42,
        tokens: { token: "t" },
        commit: { branch: "feature/42-foo" },
        ai: {
            getBugbotFixVerifyCommands: () => [] as string[],
        },
        ...overrides,
    } as unknown as Execution;
}

describe("runBugbotAutofixCommitAndPush", () => {
    beforeEach(() => {
        mockExec.mockReset();
        const actual = jest.requireActual<{ parse: (s: string, o?: unknown) => unknown }>("shell-quote");
        shellQuoteParse.mockImplementation((s: string, opts?: unknown) => actual.parse(s, opts));
        mockGetTokenUserDetails.mockResolvedValue({
            name: "Test User",
            email: "test@users.noreply.github.com",
        });
    });

    it("returns success false and committed false when branch is empty", async () => {
        const result = await runBugbotAutofixCommitAndPush(
            baseExecution({ commit: { branch: "" } } as Partial<Execution>)
        );

        expect(result).toEqual({ success: false, committed: false, error: "No branch to commit to." });
        expect(mockExec).not.toHaveBeenCalled();
    });

    it("calls git fetch and checkout when branchOverride is set", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            branchOverride: "feature/42-from-pr",
        });

        expect(mockExec).toHaveBeenCalledWith("git", ["fetch", "origin", "feature/42-from-pr"]);
        expect(mockExec).toHaveBeenCalledWith("git", ["checkout", "feature/42-from-pr"]);
        expect(mockExec).toHaveBeenCalledWith("git", ["status", "--porcelain"], expect.any(Object));
        expect(result.success).toBe(true);
        expect(result.committed).toBe(false);
    });

    it("stashes uncommitted changes before checkout and pops after when branchOverride is set", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((cmd, args, opts) => {
            const a = args ?? [];
            if (cmd === "git" && a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            branchOverride: "feature/42-from-pr",
        });

        expect(mockExec).toHaveBeenCalledWith("git", ["stash", "push", "-u", "-m", "bugbot-autofix-before-checkout"]);
        expect(mockExec).toHaveBeenCalledWith("git", ["fetch", "origin", "feature/42-from-pr"]);
        expect(mockExec).toHaveBeenCalledWith("git", ["checkout", "feature/42-from-pr"]);
        expect(mockExec).toHaveBeenCalledWith("git", ["stash", "pop"]);
        expect(result.success).toBe(true);
    });

    it("returns failure when checkout fails", async () => {
        mockExec.mockRejectedValueOnce(new Error("fetch failed"));

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            branchOverride: "feature/42-pr",
        });

        expect(result).toEqual({
            success: false,
            committed: false,
            error: "Failed to checkout branch feature/42-pr.",
        });
    });

    it("returns failure when stash pop fails after checkout (stashed changes not restored)", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((cmd, args, opts) => {
            const a = args ?? [];
            if (cmd === "git" && a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            if (cmd === "git" && a[0] === "stash" && a[1] === "pop") {
                return Promise.reject(new Error("stash pop conflict"));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            branchOverride: "feature/42-pr",
        });

        expect(result).toEqual({
            success: false,
            committed: false,
            error: "Failed to checkout branch feature/42-pr.",
        });
        const { logError } = require("../../../../../ports/logging_ports");
        expect(logError).toHaveBeenCalledWith(
            expect.stringContaining("Failed to restore stashed changes")
        );
        expect(logError).toHaveBeenCalledWith(
            expect.stringContaining("run 'git stash pop' manually")
        );
    });

    it("logs that changes were stashed when checkout fails after stashing", async () => {
        let callCount = 0;
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((cmd, args, opts) => {
            const a = args ?? [];
            if (cmd === "git" && a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            if (cmd === "git" && a[0] === "fetch") {
                callCount++;
                return Promise.reject(new Error("fetch failed"));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            branchOverride: "feature/42-pr",
        });

        expect(result.success).toBe(false);
        const { logError } = require("../../../../../ports/logging_ports");
        expect(logError).toHaveBeenCalledWith(
            expect.stringContaining("Failed to checkout branch")
        );
        expect(logError).toHaveBeenCalledWith(
            expect.stringContaining("Changes were stashed; run 'git stash pop' manually")
        );
    });

    it("runs verify commands when configured and returns failure when one fails", async () => {
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => ["pnpm test"] },
        } as Partial<Execution>);
        mockExec.mockResolvedValueOnce(1);

        const result = await runBugbotAutofixCommitAndPush(exec);

        expect(mockExec).toHaveBeenCalledWith("pnpm", ["test"]);
        expect(result).toEqual({
            success: false,
            committed: false,
            error: "Verify command failed: pnpm test.",
        });
    });

    it("rejects verify command with shell operator (command injection)", async () => {
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => ["pnpm test; rm -rf /"] },
        } as Partial<Execution>);

        const result = await runBugbotAutofixCommitAndPush(exec);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid verify command");
        expect(mockExec).not.toHaveBeenCalledWith("pnpm", expect.any(Array));
    });

    it("rejects empty or whitespace-only verify command (parseVerifyCommand returns null)", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            return Promise.resolve(0);
        });
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => ["  ", "pnpm test"] },
        } as Partial<Execution>);

        const result = await runBugbotAutofixCommitAndPush(exec);

       expect(result.success).toBe(false);
       expect(result.error).toContain("Invalid verify command");
   });

    it("rejects verify command when shell-quote parse throws", async () => {
        shellQuoteParse.mockImplementationOnce(() => {
            throw new Error("Unclosed quote");
        });
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            return Promise.resolve(0);
        });
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => ["pnpm run 'unclosed"] },
        } as Partial<Execution>);

        const result = await runBugbotAutofixCommitAndPush(exec);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid verify command");
    });

    it("returns failure when verify command exec throws", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            if (cmd === "pnpm") return Promise.reject(new Error("pnpm not found"));
            return Promise.resolve(0);
        });
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => ["pnpm test"] },
        } as Partial<Execution>);

        const result = await runBugbotAutofixCommitAndPush(exec);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Verify command failed");
        const { logError } = require("../../../../../ports/logging_ports");
       expect(logError).toHaveBeenCalledWith(
           expect.stringContaining("Verify command failed")
       );
   });

    it("treats non-array getBugbotFixVerifyCommands as empty (no verify run)", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            return Promise.resolve(0);
        });
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => "pnpm test" as unknown as string[] },
        } as Partial<Execution>);

        const result = await runBugbotAutofixCommitAndPush(exec);

        expect(result.success).toBe(true);
        expect(result.committed).toBe(true);
        expect(mockExec).not.toHaveBeenCalledWith("pnpm", expect.any(Array));
    });

    it("parses verify command with quoted args and runs it", async () => {
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => ['pnpm run "test with spaces"'] },
        } as Partial<Execution>);
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(exec);

        expect(result.success).toBe(true);
        expect(result.committed).toBe(false);
        expect(mockExec).toHaveBeenCalledWith("pnpm", ["run", "test with spaces"]);
    });

    it("limits verify commands to 20 and logs when configured count exceeds limit", async () => {
        const manyCommands = Array.from({ length: 25 }, () => "pnpm test");
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => manyCommands },
        } as Partial<Execution>);
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(exec);

        expect(result.success).toBe(true);
        expect(result.committed).toBe(false);
        expect(logInfo).toHaveBeenCalledWith(
            "Limiting verify commands to 20 (configured: 25)."
        );
        const pnpmTestCalls = (mockExec as jest.Mock).mock.calls.filter(
            (call: [string, string[]]) => call[0] === "pnpm" && call[1]?.[0] === "test"
        );
        expect(pnpmTestCalls).toHaveLength(20);
    });

    it("returns success and committed false when hasChanges returns false", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution());

        expect(result.success).toBe(true);
        expect(result.committed).toBe(false);
    });

    it("runs git config (user.name, user.email), add, commit, push when there are changes", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution());

        expect(result.success).toBe(true);
        expect(result.committed).toBe(true);
        expect(mockGetTokenUserDetails).toHaveBeenCalledWith("t");
        expect(mockExec).toHaveBeenCalledWith("git", ["config", "user.name", "Test User"]);
        expect(mockExec).toHaveBeenCalledWith("git", ["config", "user.email", "test@users.noreply.github.com"]);
        expect(mockExec).toHaveBeenCalledWith("git", ["add", "-A"]);
        expect(mockExec).toHaveBeenCalledWith("git", [
            "commit",
            "-m",
            "fix(#42): bugbot autofix - resolve reported findings",
        ]);
        expect(mockExec).toHaveBeenCalledWith("git", ["push", "origin", "feature/42-foo"]);
    });

    it("returns failure when commit or push throws", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M x"));
            }
            if (a[0] === "commit") return Promise.reject(new Error("commit failed"));
            return Promise.resolve(0);
        });
        mockGetTokenUserDetails.mockResolvedValue({ name: "U", email: "u@x.com" });

        const result = await runBugbotAutofixCommitAndPush(baseExecution());

        expect(result).toEqual({
            success: false,
            committed: false,
            error: "commit failed",
        });
    });

    it("stages only the workspace paths authorized by the autofix boundary", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M src/fix.ts\n M unrelated.ts"));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            workspacePaths: ["src/fix.ts"],
        });

        expect(result).toEqual({ success: true, committed: true });
        expect(mockExec).toHaveBeenCalledWith("git", ["add", "--", "src/fix.ts"]);
        expect(mockExec).not.toHaveBeenCalledWith("git", ["add", "-A"]);
    });

    it("includes targetFindingIds in commit message when provided", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            targetFindingIds: ["finding-1", "finding-2"],
        });

        expect(result.success).toBe(true);
        expect(result.committed).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("git", [
            "commit",
            "-m",
            "fix(#42): bugbot autofix - resolve finding-1, finding-2",
        ]);
    });

    it("sanitizes finding IDs in commit message (newlines, control chars, length)", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            targetFindingIds: ["id-with\nnewline", "normal-id", "x".repeat(200)],
        });

        expect(result.success).toBe(true);
        expect(result.committed).toBe(true);
        const commitCall = mockExec.mock.calls.find(
            (c: [string, string[]]) => c[0] === "git" && c[1]?.[0] === "commit" && c[1]?.[1] === "-m"
        );
        const commitMessage = commitCall?.[1]?.[2] ?? "";
        expect(commitMessage).toContain("fix(#42): bugbot autofix - resolve ");
        expect(commitMessage).not.toMatch(/\n/);
        expect(commitMessage).toContain("normal-id");
        expect(commitMessage).not.toContain("id-with\nnewline");
        expect(commitMessage.length).toBeLessThanOrEqual(600);
    });

    it("uses 'reported findings' when all finding IDs sanitize to empty", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            return Promise.resolve(0);
        });

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            targetFindingIds: ["   ", "\t\n\r", ""],
        });

        expect(result.success).toBe(true);
        expect(result.committed).toBe(true);
        const commitCall = mockExec.mock.calls.find(
            (c: [string, string[]]) => c[0] === "git" && c[1]?.[0] === "commit" && c[1]?.[1] === "-m"
        );
        const commitMessage = commitCall?.[1]?.[2] ?? "";
        expect(commitMessage).toContain("resolve reported findings");
    });

    it("truncates finding IDs part when total length exceeds limit", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            return Promise.resolve(0);
        });

        const longId = "a".repeat(80);
        const manyIds = Array.from({ length: 10 }, () => longId);

        const result = await runBugbotAutofixCommitAndPush(baseExecution(), {
            targetFindingIds: manyIds,
        });

        expect(result.success).toBe(true);
        expect(result.committed).toBe(true);
        const commitCall = mockExec.mock.calls.find(
            (c: [string, string[]]) => c[0] === "git" && c[1]?.[0] === "commit" && c[1]?.[1] === "-m"
        );
        const commitMessage = commitCall?.[1]?.[2] ?? "";
        expect(commitMessage).toContain("fix(#42): bugbot autofix - resolve ");
        expect(commitMessage).toMatch(/\.\.\.$/);
        expect(commitMessage.length).toBeLessThanOrEqual(550);
    });
});

describe("runUserRequestCommitAndPush", () => {
    beforeEach(() => {
        mockExec.mockReset();
        mockGetTokenUserDetails.mockResolvedValue({
            name: "Test User",
            email: "test@users.noreply.github.com",
        });
    });

    it("returns success false when branch is empty", async () => {
        const result = await runUserRequestCommitAndPush(
            baseExecution({ commit: { branch: "" } } as Partial<Execution>)
        );
        expect(result).toEqual({ success: false, committed: false, error: "No branch to commit to." });
        expect(mockExec).not.toHaveBeenCalled();
    });

    it("returns success and committed false when no changes", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            return Promise.resolve(0);
        });

        const result = await runUserRequestCommitAndPush(baseExecution());

        expect(result.success).toBe(true);
        expect(result.committed).toBe(false);
    });

    it("checks out branchOverride when provided", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((cmd, args, opts) => {
            const a = args ?? [];
            if (cmd === "git" && a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            return Promise.resolve(0);
        });

        const result = await runUserRequestCommitAndPush(baseExecution(), {
            branchOverride: "feature/42-from-issue",
        });

        expect(result.success).toBe(true);
        expect(result.committed).toBe(false);
        expect(mockExec).toHaveBeenCalledWith("git", ["fetch", "origin", "feature/42-from-issue"]);
        expect(mockExec).toHaveBeenCalledWith("git", ["checkout", "feature/42-from-issue"]);
    });

    it("returns failure when branchOverride checkout fails in user request", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((cmd, args, opts) => {
            const a = args ?? [];
            if (cmd === "git" && a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            if (cmd === "git" && a[0] === "fetch") return Promise.reject(new Error("fetch failed"));
            return Promise.resolve(0);
        });

        const result = await runUserRequestCommitAndPush(baseExecution(), {
            branchOverride: "feature/42-other",
        });

        expect(result).toEqual({
            success: false,
            committed: false,
            error: "Failed to checkout branch feature/42-other.",
        });
    });

    it("runs git add, commit with generic message, and push when there are changes", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M file.ts"));
            }
            return Promise.resolve(0);
        });

        const result = await runUserRequestCommitAndPush(baseExecution());

        expect(result.success).toBe(true);
        expect(result.committed).toBe(true);
        expect(mockGetTokenUserDetails).toHaveBeenCalledWith("t");
        expect(mockExec).toHaveBeenCalledWith("git", ["add", "-A"]);
        expect(mockExec).toHaveBeenCalledWith("git", [
            "commit",
            "-m",
            "chore(#42): apply user request",
        ]);
        expect(mockExec).toHaveBeenCalledWith("git", ["push", "origin", "feature/42-foo"]);
    });

    it("uses chore message without issue number when issueNumber is 0 or negative", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M x"));
            }
            return Promise.resolve(0);
        });

        const result = await runUserRequestCommitAndPush(
            baseExecution({ issueNumber: 0 } as Partial<Execution>)
        );

        expect(result.committed).toBe(true);
        expect(mockExec).toHaveBeenCalledWith("git", ["commit", "-m", "chore: apply user request"]);
    });

    it("treats non-array getBugbotFixVerifyCommands as empty in user request", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M x"));
            }
            return Promise.resolve(0);
        });
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => ({ length: 1 }) as unknown as string[] },
        } as Partial<Execution>);

        const result = await runUserRequestCommitAndPush(exec);

        expect(result.success).toBe(true);
        expect(result.committed).toBe(true);
        expect(mockExec).not.toHaveBeenCalledWith("pnpm", expect.any(Array));
    });

    it("limits verify commands to 20 in user request when configured count exceeds", async () => {
        const manyCommands = Array.from({ length: 22 }, () => "pnpm run lint");
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((_cmd, args, opts) => {
            const a = args ?? [];
            if (a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            return Promise.resolve(0);
        });
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => manyCommands },
        } as Partial<Execution>);

        const result = await runUserRequestCommitAndPush(exec);

        expect(result.success).toBe(true);
        expect(result.committed).toBe(false);
        expect(logInfo).toHaveBeenCalledWith(
            "Limiting verify commands to 20 (configured: 22)."
        );
    });

    it("returns failure when verify command fails in user request", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((cmd, args, opts) => {
            const a = args ?? [];
            if (cmd === "git" && a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(""));
            }
            if (cmd === "pnpm") return Promise.resolve(1);
            return Promise.resolve(0);
        });
        const exec = baseExecution({
            ai: { getBugbotFixVerifyCommands: () => ["pnpm test"] },
        } as Partial<Execution>);

        const result = await runUserRequestCommitAndPush(exec);

        expect(result.success).toBe(false);
        expect(result.committed).toBe(false);
        expect(result.error).toContain("Verify command failed");
    });

    it("returns failure when commit or push throws in user request", async () => {
        (mockExec.mockImplementation as (fn: ExecCallback) => void)((cmd, args, opts) => {
            const a = args ?? [];
            if (cmd === "git" && a[0] === "status" && opts?.listeners?.stdout) {
                opts.listeners.stdout(Buffer.from(" M x"));
            }
            if (cmd === "git" && a[0] === "push") return Promise.reject(new Error("push failed"));
            return Promise.resolve(0);
        });

        const result = await runUserRequestCommitAndPush(baseExecution());

        expect(result).toEqual({
            success: false,
            committed: false,
            error: "push failed",
        });
    });
});
