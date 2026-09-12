import type { BugbotReviewTarget } from "../../../../../domain/bugbot/context";
import { parsePositiveSafeInteger } from "../../../../../domain/positive_integer_policy";
import type { BugbotContextSelectionContext } from './bugbot_review_operation_context';

export interface LoadBugbotContextOptions {
  readonly branchOverride?: string;
  readonly issueNumberOverride?: number;
  readonly pullRequestNumberOverride?: number;
  readonly exactHeadPullRequestRequired?: boolean;
}

export interface BugbotContextRequest {
  readonly target: BugbotReviewTarget;
  readonly trustedAuthorLogin?: string;
  readonly ignorePatterns: readonly string[];
  readonly organizationRules: readonly string[];
}

export function projectBugbotContextRequest(
  context: BugbotContextSelectionContext,
  options?: LoadBugbotContextOptions,
): BugbotContextRequest {
  const issueNumber = parsePositiveSafeInteger(options?.issueNumberOverride ?? context.target.issueNumber);
  const pullRequestNumber = parsePositiveSafeInteger(
    options?.pullRequestNumberOverride
      ?? (context.target.isPullRequest ? context.target.pullRequestNumber : undefined),
  );
  const headRef = (
    options?.branchOverride
    ?? context.target.headBranch
    ?? ""
  ).trim();
  const target: BugbotReviewTarget = {
    repository: {
      owner: context.repository.owner,
      name: context.repository.name,
      ...(context.repository.id ? { id: context.repository.id } : {}),
    },
    triggerKind: context.trigger.kind,
    ...(issueNumber ? { issueNumber } : {}),
    headOwner: context.trigger.headOwner,
    headRef,
    ...(context.trigger.expectedHeadSha ? { expectedHeadSha: context.trigger.expectedHeadSha } : {}),
    pullRequestSelection: context.target.isPullRequest || pullRequestNumber !== undefined
      ? { kind: 'event', ...(pullRequestNumber ? { number: pullRequestNumber } : {}) }
      : { kind: 'exact-head', required: options?.exactHeadPullRequestRequired ?? false },
  };
  return {
    target,
    ...(context.trustedAuthorLogin ? { trustedAuthorLogin: context.trustedAuthorLogin } : {}),
    ignorePatterns: context.ignorePatterns,
    organizationRules: context.organizationRules,
  };
}
