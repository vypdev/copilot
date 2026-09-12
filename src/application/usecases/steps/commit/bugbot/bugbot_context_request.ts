import type { Execution } from "../../../../../data/model/execution";
import type { BugbotReviewTarget } from "../../../../../domain/bugbot/context";
import { parsePositiveSafeInteger } from "../../../../../domain/positive_integer_policy";
import { expectedBugbotHeadSha } from "./bugbot_review_freshness";

export interface LoadBugbotContextOptions {
  readonly branchOverride?: string;
  readonly issueNumberOverride?: number;
  readonly pullRequestNumberOverride?: number;
  readonly pullRequestRequired?: boolean;
}

export interface BugbotContextRequest {
  readonly target: BugbotReviewTarget;
  readonly trustedAuthorLogin?: string;
  readonly ignorePatterns: readonly string[];
  readonly organizationRules: readonly string[];
}

export function projectBugbotContextRequest(
  execution: Execution,
  options?: LoadBugbotContextOptions,
): BugbotContextRequest {
  const issueNumber = parsePositiveSafeInteger(options?.issueNumberOverride ?? execution.issueNumber);
  const eventPullRequestNumber = parsePositiveSafeInteger(
    options?.pullRequestNumberOverride ?? (execution.isPullRequest ? execution.pullRequest.number : undefined),
  );
  const headRef = (
    options?.branchOverride
    ?? (execution.isPullRequest ? execution.pullRequest.head : execution.commit.branch)
    ?? ""
  ).trim();
  const repositoryId = parsePositiveSafeInteger(execution.inputs?.repository?.id);
  const eventHeadOwner = execution.inputs?.pull_request?.head?.repo?.owner?.login?.trim();
  const target: BugbotReviewTarget = {
    repository: {
      owner: execution.owner,
      name: execution.repo,
      ...(repositoryId ? { id: repositoryId } : {}),
    },
    triggerKind: execution.eventName || "unknown",
    ...(issueNumber ? { issueNumber } : {}),
    headOwner: eventHeadOwner || execution.owner,
    headRef,
    ...(expectedBugbotHeadSha(execution) ? { expectedHeadSha: expectedBugbotHeadSha(execution) } : {}),
    ...(eventPullRequestNumber ? { eventPullRequestNumber } : {}),
    pullRequestRequired: options?.pullRequestRequired ?? eventPullRequestNumber !== undefined,
  };
  const configuration = execution.ai.getBugbotReviewConfiguration();
  return {
    target,
    ...(execution.tokenUser?.trim() ? { trustedAuthorLogin: execution.tokenUser.trim() } : {}),
    ignorePatterns: execution.ai.getAiIgnoreFiles(),
    organizationRules: configuration.organizationRules,
  };
}
