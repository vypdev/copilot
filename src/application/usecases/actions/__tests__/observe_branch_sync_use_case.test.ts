import type { Execution } from "../../../../data/model/execution";
import { BRANCH_SYNC_ALIGNED_MARKER, BRANCH_SYNC_STALE_MARKER } from "../../../policies/branch_sync_notification_policy";
import { ObserveBranchSyncUseCase } from "../observe_branch_sync_use_case";
import { projectBranchObservationContext } from '../../push_single_action_contexts';
import type { MessageCatalogResolutionPort } from '../../../ports/message_catalog_ports';
import { ENGLISH_BRANCH_SYNC_DEFINITION } from '../../../policies/branch_sync_message_catalog';

const dependency = { issueNumber: 42, parentBranch: "develop", workingBranch: "feature/42" };

function execution(overrides: Record<string, unknown> = {}) {
  return projectBranchObservationContext({
    owner: "org",
    repo: "repo",
    tokenUser: "vypbot",
    tokens: { token: "token" },
    ai: { getAgentConfiguration: () => ({ provider: 'codex', model: 'planner-model' }) },
    commit: { branch: "develop" },
    inputs: { after: "abc" },
    ...overrides,
  } as unknown as Execution);
}

function setup(input: { behindBy?: number; comments?: unknown[]; resolver?: MessageCatalogResolutionPort } = {}) {
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
  return { dependencies, comparisons, notifications, useCase: new ObserveBranchSyncUseCase(dependencies, comparisons, notifications, input.resolver) };
}

describe("ObserveBranchSyncUseCase", () => {
  it("creates one recommendation when an affected child is behind", async () => {
    const context = setup();
    const results = await context.useCase.invoke(execution());

    expect(context.comparisons.compare).toHaveBeenCalledWith("develop", "feature/42");
    expect(context.notifications.addComment).toHaveBeenCalledWith(
      42, expect.stringContaining(BRANCH_SYNC_STALE_MARKER),
    );
    expect(context.notifications.updateComment).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, payload: { state: "stale", behindBy: 2 } });
  });

  it("updates the bot's current recommendation instead of creating notification spam", async () => {
    const context = setup({ comments: [{ id: 8, body: BRANCH_SYNC_STALE_MARKER, user: { login: "vypbot" } }] });
    await context.useCase.invoke(execution());

    expect(context.notifications.updateComment).toHaveBeenCalledWith(
      42, 8, expect.stringContaining(BRANCH_SYNC_STALE_MARKER),
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
      42, 8, expect.stringContaining(BRANCH_SYNC_ALIGNED_MARKER),
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

  it('resolves one complete locale slice before publishing branch-sync copy', async () => {
    const resolve = jest.fn().mockResolvedValue({
      requestedLocale: 'fr-FR',
      resolvedLocale: 'fr-FR',
      source: 'dynamic',
      messages: {
        ...ENGLISH_BRANCH_SYNC_DEFINITION.messages,
        'branchSync.stale.heading': 'Synchronisation requise',
      },
    });
    const context = setup({ resolver: { resolve } });

    await context.useCase.invoke(execution({ locale: { issue: 'fr-FR' } }));

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(context.notifications.addComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining('## Synchronisation requise'),
    );
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
