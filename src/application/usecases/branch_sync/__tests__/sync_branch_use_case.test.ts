import type { Execution } from "../../../../data/model/execution";
import type { BranchMergePreparation } from "../../../ports/branch_sync_ports";
import { SyncBranchUseCase } from "../sync_branch_use_case";

const target = {
  issueNumber: 42,
  conversationNumber: 42,
  parentBranch: "develop",
  workingBranch: "feature/42",
};

function execution(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: "org",
    repo: "repo",
    tokens: { token: "token" },
    issue: { number: 42 },
    pullRequest: { number: -1 },
    issueNumber: 42,
    ai: {
      getAgentConfiguration: () => ({ provider: "codex", model: "model" }),
      getBugbotFixVerifyCommands: () => ["pnpm test"],
    },
    ...overrides,
  } as unknown as Execution;
}

function setup(preparation: BranchMergePreparation) {
  const dependencies = {
    resolveTarget: jest.fn().mockResolvedValue(target),
    listOpenDependencies: jest.fn(),
  };
  const workspace = {
    prepare: jest.fn().mockResolvedValue(preparation),
    validatePreparedMerge: jest.fn().mockResolvedValue({ valid: true }),
    assertRemoteHeadsUnchanged: jest.fn().mockResolvedValue({ valid: true }),
    commitAndPush: jest.fn().mockResolvedValue("merge-sha"),
    abort: jest.fn().mockResolvedValue(undefined),
  };
  const fixer = { fix: jest.fn().mockResolvedValue({ text: "resolved", sessionId: "s" }) };
  const authenticatedUser = { getTokenUserDetails: jest.fn().mockResolvedValue({ name: "Bot", email: "bot@example.com" }) };
  const git = { execute: jest.fn().mockResolvedValue(0) };
  return {
    dependencies,
    workspace,
    fixer,
    authenticatedUser,
    git,
    useCase: new SyncBranchUseCase(dependencies, workspace, fixer, authenticatedUser as never, git as never),
  };
}

const options = { dryRun: false, useAgent: true };

describe("SyncBranchUseCase", () => {
  it("merges a clean parent update, verifies it, checks for races, and pushes", async () => {
    const context = setup({ kind: "clean", parentSha: "parent", childSha: "child" });
    const results = await context.useCase.invoke({ execution: execution(), options });

    expect(context.fixer.fix).not.toHaveBeenCalled();
    expect(context.git.execute).toHaveBeenCalledWith("pnpm", ["test"], { untrusted: true });
    expect(context.workspace.assertRemoteHeadsUnchanged).toHaveBeenCalledWith(
      "develop", "parent", "feature/42", "child", "token",
    );
    expect(context.workspace.commitAndPush).toHaveBeenCalledWith(
      "feature/42", "Merge develop into feature/42", { name: "Bot", email: "bot@example.com" }, "token",
    );
    expect(results[0]).toMatchObject({
      success: true,
      payload: { outcome: "merged-cleanly", commitSha: "merge-sha", verificationCount: 1 },
    });
    expect(results[0].steps[0]).toContain("cleanly");
  });

  it("delegates eligible conflicts only, then validates and reports agent use", async () => {
    const preparation = { kind: "conflicted", parentSha: "parent", childSha: "child", conflictPaths: ["src/a.ts"] } as const;
    const context = setup(preparation);
    const results = await context.useCase.invoke({ execution: execution(), options });

    expect(context.fixer.fix).toHaveBeenCalledWith(expect.objectContaining({
      configuration: expect.objectContaining({ model: "model" }),
      prompt: expect.stringContaining("src/a.ts"),
    }));
    expect(context.workspace.validatePreparedMerge).toHaveBeenCalledWith(["src/a.ts"]);
    expect(results[0]).toMatchObject({ success: true, payload: { outcome: "merged-with-agent", commitSha: "merge-sha" } });
    expect(results[0].steps[0]).toContain("fixer");
  });

  it("performs a dry run without invoking the agent or pushing", async () => {
    const context = setup({ kind: "conflicted", parentSha: "parent", childSha: "child", conflictPaths: ["src/a.ts"] });
    const results = await context.useCase.invoke({
      execution: execution(),
      options: { dryRun: true, useAgent: true },
    });

    expect(context.workspace.abort).toHaveBeenCalledTimes(1);
    expect(context.fixer.fix).not.toHaveBeenCalled();
    expect(context.workspace.commitAndPush).not.toHaveBeenCalled();
    expect(results[0].steps[0]).toContain("Dry run");
  });

  it("reports a clean dry run without invoking verification or pushing", async () => {
    const context = setup({ kind: "clean", parentSha: "parent", childSha: "child" });
    const results = await context.useCase.invoke({
      execution: execution(),
      options: { dryRun: true, useAgent: true },
    });

    expect(context.workspace.abort).toHaveBeenCalledTimes(1);
    expect(context.git.execute).not.toHaveBeenCalled();
    expect(context.workspace.commitAndPush).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, payload: { outcome: "dry-run-clean" } });
  });

  it.each([
    ["agent disabled", { dryRun: false, useAgent: false }, ["src/a.ts"]],
    ["sensitive path", options, [".github/workflows/release.yml"]],
    ["too many paths", options, Array.from({ length: 21 }, (_, index) => `src/${index}.ts`)],
  ])("aborts conflicted synchronization when %s", async (_name, commandOptions, conflictPaths) => {
    const context = setup({ kind: "conflicted", parentSha: "parent", childSha: "child", conflictPaths });
    const results = await context.useCase.invoke({ execution: execution(), options: commandOptions });

    expect(context.workspace.abort).toHaveBeenCalled();
    expect(context.fixer.fix).not.toHaveBeenCalled();
    expect(context.workspace.commitAndPush).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: false });
  });

  it("aborts when verification or the remote-head race check fails", async () => {
    const verification = setup({ kind: "clean", parentSha: "parent", childSha: "child" });
    verification.git.execute.mockResolvedValue(1);
    const verifyResults = await verification.useCase.invoke({ execution: execution(), options });
    expect(verification.workspace.abort).toHaveBeenCalled();
    expect(verifyResults[0]).toMatchObject({ success: false });

    const raced = setup({ kind: "clean", parentSha: "parent", childSha: "child" });
    raced.workspace.assertRemoteHeadsUnchanged.mockResolvedValue({ valid: false, reason: "parent changed" });
    const raceResults = await raced.useCase.invoke({ execution: execution(), options });
    expect(raced.workspace.abort).toHaveBeenCalled();
    expect(raced.workspace.commitAndPush).not.toHaveBeenCalled();
    expect(raceResults[0].errors[0].message).toBe("parent changed");
  });

  it("reports a rejected verification command without leaking provider details", async () => {
    const context = setup({ kind: "clean", parentSha: "parent", childSha: "child" });
    context.git.execute.mockRejectedValue(new Error("private verification detail"));

    const results = await context.useCase.invoke({ execution: execution(), options });

    expect(context.workspace.abort).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ success: false });
    expect(JSON.stringify(results)).not.toContain("private verification detail");
  });

  it("caps an oversized verification configuration before execution", async () => {
    const context = setup({ kind: "clean", parentSha: "parent", childSha: "child" });
    const commands = Array.from({ length: 25 }, (_, index) => `pnpm test:${index}`);
    const results = await context.useCase.invoke({
      execution: execution({
        ai: {
          getAgentConfiguration: () => ({ provider: "codex", model: "model" }),
          getBugbotFixVerifyCommands: () => commands,
        },
      }),
      options,
    });

    expect(context.git.execute).toHaveBeenCalledTimes(20);
    expect(results[0]).toMatchObject({ success: true, payload: { verificationCount: 20 } });
  });

  it("uses safe fallback messages when validation or race providers omit a reason", async () => {
    const invalidResolution = setup({
      kind: "conflicted", parentSha: "parent", childSha: "child", conflictPaths: ["src/a.ts"],
    });
    invalidResolution.workspace.validatePreparedMerge.mockResolvedValue({ valid: false });
    const resolutionResults = await invalidResolution.useCase.invoke({ execution: execution(), options });
    expect(resolutionResults[0].errors[0].message).toBe("The agent resolution did not pass workspace safety validation.");

    const invalidVerification = setup({ kind: "clean", parentSha: "parent", childSha: "child" });
    invalidVerification.workspace.validatePreparedMerge.mockResolvedValue({ valid: false });
    const verificationResults = await invalidVerification.useCase.invoke({ execution: execution(), options });
    expect(verificationResults[0].errors[0].message).toBe("Verification commands changed the prepared merge unexpectedly.");

    const raced = setup({ kind: "clean", parentSha: "parent", childSha: "child" });
    raced.workspace.assertRemoteHeadsUnchanged.mockResolvedValue({ valid: false });
    const raceResults = await raced.useCase.invoke({ execution: execution(), options });
    expect(raceResults[0].errors[0].message).toBe(
      "A branch changed while synchronization was running; retry from the latest heads.",
    );
  });

  it("fails closed when the conflict-resolution agent returns no usable response", async () => {
    const context = setup({
      kind: "conflicted", parentSha: "parent", childSha: "child", conflictPaths: ["src/a.ts"],
    });
    context.fixer.fix.mockResolvedValue({ text: "   " });

    const results = await context.useCase.invoke({ execution: execution(), options });

    expect(context.workspace.abort).toHaveBeenCalledTimes(1);
    expect(context.workspace.validatePreparedMerge).not.toHaveBeenCalled();
    expect(results[0].errors[0].message).toBe("The conflict-resolution agent returned no usable response.");
  });

  it("returns an idempotent result for aligned branches and supports an explicit parent", async () => {
    const context = setup({ kind: "aligned", parentSha: "parent", childSha: "child" });
    const results = await context.useCase.invoke({
      execution: execution({ pullRequest: { number: 91 }, issue: { number: 42 } }),
      options: { dryRun: false, useAgent: true, parentOverride: "release/3" },
    });

    expect(context.dependencies.resolveTarget).toHaveBeenCalledWith("org", "repo", 91, "token");
    expect(context.workspace.prepare).toHaveBeenCalledWith("release/3", "feature/42", "token");
    expect(results[0]).toMatchObject({ success: true, executed: false });
  });

  it("rejects a parent override that names the working branch", async () => {
    const context = setup({ kind: "aligned", parentSha: "parent", childSha: "child" });
    const results = await context.useCase.invoke({
      execution: execution({ pullRequest: { number: -1 }, issue: { number: -1 }, issueNumber: 7 }),
      options: { ...options, parentOverride: "feature/42" },
    });

    expect(context.dependencies.resolveTarget).toHaveBeenCalledWith("org", "repo", 7, "token");
    expect(context.workspace.prepare).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: false, executed: false });
  });

  it("fails closed when no target exists or a provider throws", async () => {
    const missing = setup({ kind: "aligned", parentSha: "parent", childSha: "child" });
    missing.dependencies.resolveTarget.mockResolvedValue(undefined);
    const missingResults = await missing.useCase.invoke({
      execution: execution({ pullRequest: { number: -1 }, issue: { number: -1 }, issueNumber: -1 }),
      options,
    });
    expect(missing.dependencies.resolveTarget).toHaveBeenCalledWith("org", "repo", -1, "token");
    expect(missingResults[0]).toMatchObject({ success: false, executed: false });

    const failed = setup({ kind: "clean", parentSha: "parent", childSha: "child" });
    failed.workspace.prepare.mockRejectedValue(new Error("secret provider detail"));
    failed.workspace.abort.mockRejectedValue(new Error("abort detail"));
    const failedResults = await failed.useCase.invoke({ execution: execution(), options });
    expect(failedResults[0]).toMatchObject({ success: false, executed: true });
    expect(JSON.stringify(failedResults)).not.toContain("secret provider detail");
  });
});
