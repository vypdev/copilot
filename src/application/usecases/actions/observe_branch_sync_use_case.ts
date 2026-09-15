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

      const messages = await resolveBranchSyncCatalog(
        context.locale,
        context.agentConfiguration,
        this.catalogResolver,
      );
      const results: Result[] = [];
      for (const dependency of dependencies) {
        results.push(await this.reconcileDependency(context, dependency, messages));
      }
      return results;
    } catch (cause) {
      logError("Branch synchronization observation failed.", { pushedBranch });
      return [failure("Unable to inspect branch synchronization safely.", cause)];
    }
  }

  private async reconcileDependency(
    context: BranchObservationContext,
    dependency: BranchDependency,
    messages: BranchSyncMessageCatalog,
  ): Promise<Result> {
    try {
      const comparison = await this.comparisons.compare(
        dependency.parentBranch,
        dependency.workingBranch,
      );
      const comments = await this.notifications.listIssueComments(
        dependency.issueNumber,
      );
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
          await this.notifications.addComment(
            dependency.issueNumber,
            comment,
          );
          return success(dependency, comparison.behindBy, "stale");
        }

        const transitionedFromAligned = !isStaleBranchSyncComment(latest.body);
        if (latest.body !== comment) {
          await this.notifications.updateComment(
            dependency.issueNumber,
            latest.id,
            comment,
          );
        }
        if (!transitionedFromAligned || !context.sourceHeadSha || !context.trustedBotLogin) {
          return success(dependency, comparison.behindBy, "stale");
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
          }, this.notifications);
          const cleanup = buildDuplicateCompactionPublicationPayload(transition.compactedCommentIds);
          return success(dependency, comparison.behindBy, "stale", {
            ...buildTransitionPublicationPayload(intent, transition.effect),
            ...(cleanup ?? {}),
          });
        } catch (cause) {
          return failure(
            `Branch status was updated for issue #${dependency.issueNumber}, but its action notification could not be published.`,
            cause,
            { ...dependency, behindBy: comparison.behindBy, state: 'stale', statusUpdated: true },
          );
        }
      }

      if (latest && isStaleBranchSyncComment(latest.body)) {
        await this.notifications.updateComment(
          dependency.issueNumber,
          latest.id,
          buildAlignedBranchSyncComment(dependency, messages),
        );
      }
      return success(dependency, 0, "aligned");
    } catch (cause) {
      logError("Branch synchronization dependency reconciliation failed.", {
        issueNumber: dependency.issueNumber,
      });
      return failure(
        `Unable to inspect branch synchronization for issue #${dependency.issueNumber}.`,
        cause,
      );
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
