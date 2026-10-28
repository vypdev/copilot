import { retireUnrelatedBranchSyncCards } from './retire_unrelated_branch_sync_cards';
import type { BoundReplyRequestReadPort } from '../../ports/reply_request_read_ports';
import { parsePublicationMarker } from '../../policies/publication_identity_policy';
import { Result } from "../../../data/model/result";
import {
  buildAlignedBranchSyncComment,
  buildBranchSyncDuplicatePointer,
  buildBranchSyncStatusCommentUrl,
  buildBranchSyncTransitionIntent,
  buildBranchSyncTransitionNotification,
  buildStaleBranchSyncComment,
  findLatestBranchSyncComment,
  isStaleBranchSyncComment,
  selectBranchDependenciesForPush,
} from "../../policies/branch_sync_notification_policy";
import type {
  BranchDependency,
  BoundBranchDependencyQueryPort,
  BoundBranchSyncComparisonPort,
} from "../../ports/branch_sync_ports";
import type { BoundIssueCommentPublicationPort } from '../../ports/issue_lifecycle_ports';
import type { BranchObservationContext } from '../push_single_action_contexts';
import { logError, logInfo } from "../../ports/logging_ports";
import type { ParamUseCase } from "../base/param_usecase";
import { toApplicationError } from "../../errors/application_error";
import type { BoundIssueCompletionReadPort } from '../../ports/issue_completion_ports';
import type { MessageCatalogResolutionPort } from '../../ports/message_catalog_ports';
import {
  resolveBranchSyncCatalog,
  type BranchSyncMessageCatalog,
} from '../../policies/branch_sync_message_catalog';
import { reconcileTransitionNotification } from '../steps/common/transition_notification_workflow';
import {
  buildDuplicateCompactionPublicationPayload,
  buildTransitionPublicationPayload,
} from '../../policies/publication_outcome_policy';

import type { RetireBranchSyncContext } from './retire_branch_sync_use_case';
import { ApplicationError } from '../../errors/application_error';

const TASK_ID = "ObserveBranchSyncUseCase";

/**
 * Cheap push-time observer. It only queries branch relationships/comparisons
 * and maintains one stateful notification per issue; no agent is reachable.
 */
export class ObserveBranchSyncUseCase implements ParamUseCase<BranchObservationContext, Result[]> {
  readonly taskId = TASK_ID;

  constructor(
    private readonly dependencies: BoundBranchDependencyQueryPort,
    private readonly comparisons: BoundBranchSyncComparisonPort,
    private readonly notifications: BoundIssueCommentPublicationPort,
    private readonly catalogResolver?: MessageCatalogResolutionPort,
    private readonly nativeIssues?: BoundIssueCompletionReadPort,
    private readonly retirement?: ParamUseCase<RetireBranchSyncContext, Result[]>,
    private readonly cardFreshness?: BoundReplyRequestReadPort,
  ) {}

  async invoke(context: BranchObservationContext): Promise<Result[]> {
    const pushedBranch = context.pushedBranch;
    if (!pushedBranch || context.deletedPush) return [];

    try {
      const dependencies = selectBranchDependenciesForPush(
        await this.dependencies.listOpenDependencies(),
        pushedBranch,
      );
      if (dependencies.length === 0) {
        logInfo(`No open branch dependencies are affected by ${pushedBranch}.`);
        return [];
      }

      let catalog: Promise<BranchSyncMessageCatalog> | undefined;
      const getMessages = () => catalog ??= resolveBranchSyncCatalog(
        context.locale, context.agentConfiguration, this.catalogResolver,
      );
      const results: Result[] = [];
      for (const dependency of dependencies) {
        results.push(await this.reconcileDependency(context, dependency, getMessages));
      }
      return results;
    } catch (cause) {
      logError("Branch synchronization observation failed.", { pushedBranch });
      return [failure("Unable to inspect branch synchronization safely.", cause)];
    }
  }

  private openNotifications(dependency: BranchDependency): BoundIssueCommentPublicationPort {
    const assertOpen = async (number: number) => {
      if (number !== dependency.issueNumber || !this.nativeIssues) throw new ApplicationError('workflow.stale', 'Native issue state is unavailable.');
      await this.assertCurrent(dependency);
    };
    return Object.freeze({
      listIssueComments: (number: number) => this.notifications.listIssueComments(number),
      addComment: async (number: number, body: string) => {
        await assertOpen(number);
        await this.notifications.addComment(number, body);
      },
      updateComment: async (number: number, id: number, body: string) => {
        await assertOpen(number);
        await this.notifications.updateComment(number, id, body);
      },
      removeComment: async (number: number, id: number) => {
        await assertOpen(number);
        return this.notifications.removeComment(number, id);
      },
    });
  }

  private async reconcileDependency(
    context: BranchObservationContext,
    dependency: BranchDependency,
    getMessages: () => Promise<BranchSyncMessageCatalog>,
  ): Promise<Result> {
    let retiredCards = 0;
    try {
      if (!this.nativeIssues) throw new ApplicationError('workflow.stale', 'Native issue state is unavailable.');
      const initial = await this.nativeIssues.readIssue(dependency.issueNumber);
      if (initial.number !== dependency.issueNumber || !['open', 'closed'].includes(initial.state)) throw new ApplicationError('workflow.stale', 'Native issue identity is unavailable.');
      if (initial.state === 'closed') {
        if (!this.retirement) throw new ApplicationError('workflow.stale', 'Terminal recommendation retirement is unavailable.');
        const [result] = await this.retirement.invoke({
          issueNumber: dependency.issueNumber, locale: context.locale, trustedBotLogin: context.trustedBotLogin,
        });
        return result;
      }
      const messages = await getMessages();
      const beforeComparison = await this.nativeIssues.readIssue(dependency.issueNumber);
      if (beforeComparison.number !== dependency.issueNumber || !['open', 'closed'].includes(beforeComparison.state)) {
        throw new ApplicationError('workflow.stale', 'Native issue identity is unavailable.');
      }
      if (beforeComparison.state === 'closed') {
        if (!this.retirement) throw new ApplicationError('workflow.stale', 'Terminal recommendation retirement is unavailable.');
        const [result] = await this.retirement.invoke({
          issueNumber: dependency.issueNumber, locale: context.locale, trustedBotLogin: context.trustedBotLogin,
        });
        return result;
      }
      await this.assertRelationship(dependency);
      const notifications = this.openNotifications(dependency);
      const comparison = await this.comparisons.compare(
        dependency.parentBranch,
        dependency.workingBranch,
      );
      const comments = await notifications.listIssueComments(
        dependency.issueNumber,
      );
      await this.assertCurrent(dependency);
      await retireUnrelatedBranchSyncCards({ comments, current: dependency, botLogin: context.trustedBotLogin, messages,
        freshness: this.cardFreshness, updates: notifications, onUpdated: () => { retiredCards++; },
        assertCurrent: () => this.assertCurrent(dependency) });
      const latest = findLatestBranchSyncComment(comments, context.trustedBotLogin, dependency);

      if (comparison.behindBy > 0) {
        const comment = buildStaleBranchSyncComment({
          owner: context.repository.owner,
          repository: context.repository.name,
          dependency,
          comparison,
          messages,
        });
        if (!latest) {
          await notifications.addComment(
            dependency.issueNumber,
            comment,
          );
          return success(dependency, comparison.behindBy, "stale", { retiredCards });
        }

        const transitionedFromAligned = !isStaleBranchSyncComment(latest.body)
          && !parsePublicationMarker(latest.body)!.sourceVersion.startsWith('relationship-retired:');
        if (latest.body !== comment) {
          await notifications.updateComment(
            dependency.issueNumber,
            latest.id,
            comment,
          );
        }
        if (!transitionedFromAligned || !context.sourceHeadSha || !context.trustedBotLogin) {
          return success(dependency, comparison.behindBy, "stale", { retiredCards });
        }

        const intent = buildBranchSyncTransitionIntent(dependency, context.sourceHeadSha, context.locale);
        try {
          const transition = await reconcileTransitionNotification({
            owner: context.repository.owner,
            repository: context.repository.name,
            botLogin: context.trustedBotLogin,
            intent,
            message: buildBranchSyncTransitionNotification(
              dependency,
              messages,
              buildBranchSyncStatusCommentUrl(
                context.repository.owner,
                context.repository.name,
                dependency.issueNumber,
                latest.id,
              ),
            ),
            duplicatePointer: canonicalUrl => buildBranchSyncDuplicatePointer(messages, canonicalUrl),
          }, notifications);
          const cleanup = buildDuplicateCompactionPublicationPayload(transition.compactedCommentIds);
          return success(dependency, comparison.behindBy, "stale", { retiredCards,
            ...buildTransitionPublicationPayload(intent, transition.effect),
            ...(cleanup ?? {}),
          });
        } catch (cause) {
          return failure(
            `Branch status was updated for issue #${dependency.issueNumber}, but its action notification could not be published.`,
            cause,
            { ...dependency, behindBy: comparison.behindBy, state: 'stale', statusUpdated: true, retiredCards },
          );
        }
      }

      if (latest && (isStaleBranchSyncComment(latest.body) || parsePublicationMarker(latest.body)?.sourceVersion === 'closed:issue'
        || parsePublicationMarker(latest.body)?.sourceVersion.startsWith('relationship-retired:'))) {
        await notifications.updateComment(
          dependency.issueNumber,
          latest.id,
          buildAlignedBranchSyncComment(dependency, messages),
        );
      }
      await this.assertCurrent(dependency);
      return success(dependency, 0, "aligned", { retiredCards });
    } catch (cause) {
      logError("Branch synchronization dependency reconciliation failed.", {
        issueNumber: dependency.issueNumber,
      });
      return failure(
        `Unable to inspect branch synchronization for issue #${dependency.issueNumber}.`,
        cause, { ...dependency, retiredCards, reconciliationComplete: false },
      );
    }
  }

  private async assertCurrent(dependency: BranchDependency): Promise<void> {
    const current = await this.nativeIssues!.readIssue(dependency.issueNumber);
    if (current.number !== dependency.issueNumber || current.state !== 'open') throw new ApplicationError('workflow.stale', 'The issue is no longer open.');
    await this.assertRelationship(dependency);
  }

  private async assertRelationship(dependency: BranchDependency): Promise<void> {
    const current = await this.dependencies.resolveTarget(dependency.issueNumber);
    if (!current || current.issueNumber !== dependency.issueNumber || current.conversationNumber !== dependency.issueNumber
      || current.parentBranch !== dependency.parentBranch || current.workingBranch !== dependency.workingBranch) {
      throw new ApplicationError('workflow.stale', 'The issue branch relationship changed or is unavailable.');
    }
  }
}

function success(
  dependency: BranchDependency,
  behindBy: number,
  state: "stale" | "aligned",
  evidence: Readonly<Record<string, unknown>> = {},
): Result {
  return new Result({
    id: TASK_ID,
    success: true,
    executed: true,
    steps: [
      state === "stale"
        ? `Issue #${dependency.issueNumber}: ${dependency.workingBranch} is ${behindBy} commit(s) behind ${dependency.parentBranch}.`
        : `Issue #${dependency.issueNumber}: ${dependency.workingBranch} is aligned with ${dependency.parentBranch}.`,
    ],
    payload: { ...dependency, behindBy, state, ...evidence },
  });
}

function failure(message: string, cause: unknown, payload?: Readonly<Record<string, unknown>>): Result {
  return new Result({
    id: TASK_ID,
    success: false,
    executed: true,
    steps: [message],
    errors: [toApplicationError(cause, 'provider.unavailable', message)],
    ...(payload ? { payload } : {}),
  });
}
