import type { BugbotFindingResolutionPorts } from "../../../../../application/ports/bugbot_finding_resolution_ports";
import { PullRequestReviewOperationError } from "../../../../../application/ports/pull_request_review_errors";
import type { Execution } from "../../../../../data/model/execution";
import { logError } from "../../../../../utils/logger";
import type {
  BugbotContext,
  ExistingPullRequestFindingInfo,
} from "./types";
import { resolveIssueFinding } from "./resolve_issue_finding";
import { resolvePullRequestFinding } from "./resolve_pull_request_finding";

export interface MarkFindingsResolvedParam {
  execution: Execution;
  context: BugbotContext;
  resolvedFindingIds: Set<string>;
  ports: BugbotFindingResolutionPorts;
}

function resolutionError(destination: "issue" | "pull request"): Error {
  return destination === "pull request"
    ? new PullRequestReviewOperationError("mark-resolved")
    : new Error("Unable to mark an issue finding as resolved.");
}

async function tryResolvePullRequestFinding(
  ports: BugbotFindingResolutionPorts,
  execution: Execution,
  findingId: string,
  destination: ExistingPullRequestFindingInfo,
  errors: Error[],
): Promise<void> {
  try {
    await resolvePullRequestFinding(ports.pullRequestComments, {
      findingId,
      commentIdentity: destination.commentIdentity,
      pullRequestNumber: destination.pullRequestNumber,
      owner: execution.owner,
      repo: execution.repo,
      token: execution.tokens.token,
    });
  } catch {
    const error = resolutionError("pull request");
    logError(error);
    errors.push(error);
  }
}

export async function markFindingsResolved(
  param: MarkFindingsResolvedParam,
): Promise<Error[]> {
  const { execution, context, resolvedFindingIds, ports } = param;
  const errors: Error[] = [];

  for (const [findingId, existing] of Object.entries(
    context.existingByFindingId,
  )) {
    const pullRequestDestination = existing.pullRequest;

    // Marker-true comments can predate thread-first ordering. Repair their thread
    // independently of the agent response; the provider operation is idempotent.
    if (pullRequestDestination?.resolved) {
      await tryResolvePullRequestFinding(
        ports,
        execution,
        findingId,
        pullRequestDestination,
        errors,
      );
    }

    if (!resolvedFindingIds.has(findingId)) continue;

    if (pullRequestDestination != null && !pullRequestDestination.resolved) {
      await tryResolvePullRequestFinding(
        ports,
        execution,
        findingId,
        pullRequestDestination,
        errors,
      );
    }

    const issueDestination = existing.issue;
    if (issueDestination == null || issueDestination.resolved) continue;
    const issueComment = context.issueComments.find(
      (comment) => comment.id === issueDestination.commentId,
    );
    if (issueComment?.body == null) {
      const error = resolutionError("issue");
      logError(error);
      errors.push(error);
      continue;
    }

    try {
      await resolveIssueFinding(ports.issueComments, {
        findingId,
        comment: { id: issueComment.id, body: issueComment.body },
        owner: execution.owner,
        repo: execution.repo,
        issueNumber: execution.issueNumber,
        token: execution.tokens.token,
      });
    } catch {
      const error = resolutionError("issue");
      logError(error);
      errors.push(error);
    }
  }

  return errors;
}
