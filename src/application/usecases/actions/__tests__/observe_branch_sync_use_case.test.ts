import type { Execution } from "../../../../data/model/execution";
import {
  buildAlignedBranchSyncComment,
  buildBranchSyncTransitionIntent,
  buildStaleBranchSyncComment,
} from "../../../policies/branch_sync_notification_policy";
import { ObserveBranchSyncUseCase } from "../observe_branch_sync_use_case";
import { projectBranchObservationContext } from '../../push_single_action_contexts';
import type { MessageCatalogResolutionPort } from '../../../ports/message_catalog_ports';
import { ENGLISH_BRANCH_SYNC_DEFINITION } from '../../../policies/branch_sync_message_catalog';
import { resolveStaticBranchSyncCatalog } from '../../../policies/branch_sync_message_catalog';
import { renderTransitionNotification } from '../../steps/common/transition_notification_workflow';

const dependency = { issueNumber: 42, parentBranch: "develop", workingBranch: "feature/42" };
const messages = resolveStaticBranchSyncCatalog('en-US');

function staleBody(aheadBy = 1, behindBy = 2): string {
  return buildStaleBranchSyncComment({
    owner: 'org', repository: 'repo', dependency,
    comparison: { aheadBy, behindBy }, messages,
  });
}

function execution(overrides: Record<string, unknown> = {}) {
  return projectBranchObservationContext({
    owner: "org",
    repo: "repo",
    tokenUser: "vypbot",
    tokens: { token: "token" },
    locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
    ai: { getAgentConfiguration: () => ({ provider: 'codex', model: 'planner-model' }) },
    commit: { branch: "develop" },
    inputs: { after: "abc" },
    ...overrides,
  } as unknown as Execution);
}

function setup(input: {
  behindBy?: number;
  comments?: Array<{ id: number; body: string | null; user?: { login?: string } }>;
  resolver?: MessageCatalogResolutionPort;
  removal?: 'removed' | 'compaction-required';
} = {}) {
  const dependencies = {
    listOpenDependencies: jest.fn().mockResolvedValue([dependency]),
    resolveTarget: jest.fn(),
  };
  const comparisons = { compare: jest.fn().mockResolvedValue({ aheadBy: 1, behindBy: input.behindBy ?? 2 }) };
  const stored = [...(input.comments ?? [])];
  let nextId = Math.max(0, ...stored.map(comment => comment.id)) + 1;
  const notifications = {
    listIssueComments: jest.fn().mockImplementation(async () => stored.map(comment => ({ ...comment }))),
    addComment: jest.fn().mockImplementation(async (_issueNumber: number, body: string) => {
      stored.push({ id: nextId++, body, user: { login: 'vypbot' } });
    }),
    updateComment: jest.fn().mockImplementation(async (_issueNumber: number, commentId: number, body: string) => {
      const index = stored.findIndex(comment => comment.id === commentId);
      if (index >= 0) stored[index] = { ...stored[index], body };
    }),
    removeComment: jest.fn().mockImplementation(async (_issueNumber: number, commentId: number) => {
      if (input.removal === 'compaction-required') return 'compaction-required' as const;
      const index = stored.findIndex(comment => comment.id === commentId);
      if (index >= 0) stored.splice(index, 1);
      return 'removed' as const;
    }),
  };
  return {
    dependencies,
    comparisons,
    notifications,
    stored,
    useCase: new ObserveBranchSyncUseCase(dependencies, comparisons, notifications, input.resolver),
  };
}

describe("ObserveBranchSyncUseCase", () => {
  it("creates one recommendation when an affected child is behind", async () => {
    const context = setup();
    const results = await context.useCase.invoke(execution());

    expect(context.comparisons.compare).toHaveBeenCalledWith("develop", "feature/42");
    expect(context.notifications.addComment).toHaveBeenCalledWith(
      42, expect.stringContaining('topic="branch-sync" target="issue:42"'),
    );
    expect(context.notifications.updateComment).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, payload: { state: "stale", behindBy: 2 } });
  });

  it("updates the bot's current recommendation instead of creating notification spam", async () => {
    const context = setup({ comments: [{ id: 8, body: staleBody(0, 1), user: { login: "vypbot" } }] });
    await context.useCase.invoke(execution());

    expect(context.notifications.updateComment).toHaveBeenCalledWith(
      42, 8, expect.stringContaining('topic="branch-sync" target="issue:42"'),
    );
    expect(context.notifications.addComment).not.toHaveBeenCalled();
  });

  it('skips an unchanged stale-card update and creates no transition notification', async () => {
    const body = buildStaleBranchSyncComment({
      owner: 'org', repository: 'repo', dependency,
      comparison: { aheadBy: 1, behindBy: 2 },
      messages: resolveStaticBranchSyncCatalog('en-US'),
    });
    const context = setup({ comments: [{ id: 8, body, user: { login: 'vypbot' } }] });

    await context.useCase.invoke(execution({ inputs: { after: 'a'.repeat(40) } }));

    expect(context.notifications.updateComment).not.toHaveBeenCalled();
    expect(context.notifications.addComment).not.toHaveBeenCalled();
  });

  it('updates a changed stale projection without creating another timeline notification', async () => {
    const body = buildStaleBranchSyncComment({
      owner: 'org', repository: 'repo', dependency,
      comparison: { aheadBy: 0, behindBy: 1 },
      messages: resolveStaticBranchSyncCatalog('en-US'),
    });
    const context = setup({ comments: [{ id: 8, body, user: { login: 'vypbot' } }] });

    await context.useCase.invoke(execution({ inputs: { after: 'a'.repeat(40) } }));

    expect(context.notifications.updateComment).toHaveBeenCalledTimes(1);
    expect(context.notifications.addComment).not.toHaveBeenCalled();
  });

  it('publishes one short notification when an aligned card becomes stale', async () => {
    const aligned = buildAlignedBranchSyncComment(dependency, resolveStaticBranchSyncCatalog('en-US'));
    const context = setup({ comments: [{ id: 8, body: aligned, user: { login: 'vypbot' } }] });

    const results = await context.useCase.invoke(execution({ inputs: { after: 'a'.repeat(40) } }));

    expect(context.notifications.updateComment).toHaveBeenCalledWith(42, 8, expect.stringContaining('topic="branch-sync" target="issue:42"'));
    expect(context.notifications.addComment).toHaveBeenCalledTimes(1);
    expect(context.notifications.addComment).toHaveBeenCalledWith(
      42,
      expect.stringContaining('[Open the current status](https://github.com/org/repo/issues/42#issuecomment-8)'),
    );
    expect(results[0]).toMatchObject({
      success: true,
      payload: { publicationTransition: { topic: 'branch-sync', target: 'issue:42', effect: 'created' } },
    });

    await context.useCase.invoke(execution({ inputs: { after: 'a'.repeat(40) } }));
    expect(context.notifications.addComment).toHaveBeenCalledTimes(1);
    expect(context.notifications.updateComment).toHaveBeenCalledTimes(1);
  });

  it('updates aligned state without notifying when a trustworthy source head is unavailable', async () => {
    const aligned = buildAlignedBranchSyncComment(dependency, resolveStaticBranchSyncCatalog('en-US'));
    const context = setup({ comments: [{ id: 8, body: aligned, user: { login: 'vypbot' } }] });

    await context.useCase.invoke(execution());

    expect(context.notifications.updateComment).toHaveBeenCalledTimes(1);
    expect(context.notifications.addComment).not.toHaveBeenCalled();
  });

  it('reuses an exact transition and records compacted duplicate evidence', async () => {
    const messages = resolveStaticBranchSyncCatalog('en-US');
    const aligned = buildAlignedBranchSyncComment(dependency, messages);
    const intent = buildBranchSyncTransitionIntent(dependency, 'a'.repeat(40), 'en-US');
    const transition = renderTransitionNotification(intent, 'Existing notification.');
    const context = setup({
      comments: [
        { id: 8, body: aligned, user: { login: 'vypbot' } },
        { id: 9, body: transition, user: { login: 'vypbot' } },
        { id: 10, body: transition, user: { login: 'VYPBOT' } },
      ],
      removal: 'compaction-required',
    });

    const results = await context.useCase.invoke(execution({ inputs: { after: 'a'.repeat(40) } }));

    expect(context.notifications.addComment).not.toHaveBeenCalled();
    expect(context.notifications.removeComment).toHaveBeenCalledWith(42, 10);
    expect(context.notifications.updateComment).toHaveBeenCalledWith(
      42, 10, expect.stringContaining('[View the original notification]'),
    );
    expect(results[0]).toMatchObject({
      success: true,
      payload: {
        publicationTransition: { effect: 'unchanged' },
        publicationCleanup: { compactedCommentIds: [10], compactedCount: 1 },
      },
    });
  });

  it('preserves the updated stale card and reports a publication-only failure', async () => {
    const aligned = buildAlignedBranchSyncComment(dependency, resolveStaticBranchSyncCatalog('en-US'));
    const context = setup({ comments: [{ id: 8, body: aligned, user: { login: 'vypbot' } }] });
    context.notifications.addComment.mockRejectedValueOnce(new Error('secret provider detail'));

    const first = await context.useCase.invoke(execution({ inputs: { after: 'a'.repeat(40) } }));
    expect(first[0]).toMatchObject({
      success: false,
      payload: { state: 'stale', statusUpdated: true },
    });
    expect(first[0].steps[0]).toContain('status was updated');
    expect(JSON.stringify(first)).not.toContain('secret provider detail');

    const replay = await context.useCase.invoke(execution({ inputs: { after: 'a'.repeat(40) } }));
    expect(replay[0]).toMatchObject({ success: true, payload: { state: 'stale' } });
    expect(context.notifications.addComment).toHaveBeenCalledTimes(1);
  });

  it("resolves the prior warning once the branch is aligned", async () => {
    const context = setup({
      behindBy: 0,
      comments: [{ id: 8, body: staleBody(), user: { login: "vypbot" } }],
    });
    const results = await context.useCase.invoke(execution({ commit: { branch: "feature/42" } }));

    expect(context.notifications.updateComment).toHaveBeenCalledWith(
      42, 8, expect.stringContaining('source="aligned:'),
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
