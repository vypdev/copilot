import type { Execution } from "../../../../data/model/execution";
import { BRANCH_SYNC_ALIGNED_MARKER, BRANCH_SYNC_STALE_MARKER } from "../../../policies/branch_sync_notification_policy";
import { ObserveBranchSyncUseCase } from "../observe_branch_sync_use_case";

const dependency = { issueNumber: 42, parentBranch: "develop", workingBranch: "feature/42" };

function execution(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: "org",
    repo: "repo",
    tokenUser: "vypbot",
    tokens: { token: "token" },
    commit: { branch: "develop" },
    inputs: { after: "abc" },
    ...overrides,
  } as unknown as Execution;
}

function setup(input: { behindBy?: number; comments?: unknown[] } = {}) {
  const dependencies = {
    listOpenDependencies: jest.fn().mockResolvedValue([dependency]),
    resolveTarget: jest.fn(),
  };
  const comparisons = { compare: jest.fn().mockResolvedValue({ aheadBy: 1, behindBy: input.behindBy ?? 2 }) };
  const notifications = {
    listIssueComments: jest.fn().mockResolvedValue(input.comments ?? []),
    addComment: jest.fn().mockResolvedValue(undefined),
    updateComment: jest.fn().mockResolvedValue(undefined),
  };
  return { dependencies, comparisons, notifications, useCase: new ObserveBranchSyncUseCase(dependencies, comparisons, notifications) };
}

describe("ObserveBranchSyncUseCase", () => {
  it("creates one recommendation when an affected child is behind", async () => {
    const context = setup();
    const results = await context.useCase.invoke(execution());

    expect(context.comparisons.compare).toHaveBeenCalledWith("org", "repo", "develop", "feature/42", "token");
    expect(context.notifications.addComment).toHaveBeenCalledWith(
      "org", "repo", 42, expect.stringContaining(BRANCH_SYNC_STALE_MARKER), "token",
    );
    expect(context.notifications.updateComment).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, payload: { state: "stale", behindBy: 2 } });
  });

  it("updates the bot's current recommendation instead of creating notification spam", async () => {
    const context = setup({ comments: [{ id: 8, body: BRANCH_SYNC_STALE_MARKER, user: { login: "vypbot" } }] });
    await context.useCase.invoke(execution());

    expect(context.notifications.updateComment).toHaveBeenCalledWith(
      "org", "repo", 42, 8, expect.stringContaining(BRANCH_SYNC_STALE_MARKER), "token",
    );
    expect(context.notifications.addComment).not.toHaveBeenCalled();
  });

  it("resolves the prior warning once the branch is aligned", async () => {
    const context = setup({
      behindBy: 0,
      comments: [{ id: 8, body: BRANCH_SYNC_STALE_MARKER, user: { login: "vypbot" } }],
    });
    const results = await context.useCase.invoke(execution({ commit: { branch: "feature/42" } }));

    expect(context.notifications.updateComment).toHaveBeenCalledWith(
      "org", "repo", 42, 8, expect.stringContaining(BRANCH_SYNC_ALIGNED_MARKER), "token",
    );
    expect(results[0]).toMatchObject({ payload: { state: "aligned" } });
  });

  it("reports an aligned branch without publishing when no stale warning exists", async () => {
    const context = setup({ behindBy: 0 });
    const results = await context.useCase.invoke(execution({ commit: { branch: "feature/42" } }));

    expect(context.notifications.addComment).not.toHaveBeenCalled();
    expect(context.notifications.updateComment).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, payload: { state: "aligned", behindBy: 0 } });
  });

  it("does nothing for deleted pushes or unrelated branches", async () => {
    const deleted = setup();
    await expect(deleted.useCase.invoke(execution({ inputs: { after: "0".repeat(40) } }))).resolves.toEqual([]);
    expect(deleted.dependencies.listOpenDependencies).not.toHaveBeenCalled();

    const unrelated = setup();
    unrelated.dependencies.listOpenDependencies.mockResolvedValue([dependency]);
    await expect(unrelated.useCase.invoke(execution({ commit: { branch: "main" } }))).resolves.toEqual([]);
    expect(unrelated.comparisons.compare).not.toHaveBeenCalled();
  });

  it("isolates a provider failure into a sanitized result", async () => {
    const context = setup();
    context.comparisons.compare.mockRejectedValue(new Error("secret provider detail"));
    const results = await context.useCase.invoke(execution());

    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].steps[0]).toContain("issue #42");
    expect(JSON.stringify(results)).not.toContain("secret provider detail");
  });

  it("sanitizes a dependency-discovery failure at the observer boundary", async () => {
    const context = setup();
    context.dependencies.listOpenDependencies.mockRejectedValue(new Error("secret discovery detail"));

    const results = await context.useCase.invoke(execution());

    expect(context.comparisons.compare).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].steps[0]).toBe("Unable to inspect branch synchronization safely.");
    expect(JSON.stringify(results)).not.toContain("secret discovery detail");
  });
});
