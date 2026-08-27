import type { Execution } from "../../../../../data/model/execution";
import type { BugbotFindingPublicationPorts } from "../../../../../application/ports/bugbot_finding_publication_ports";
import type { BugbotFindingResolutionPorts } from "../../../../../application/ports/bugbot_finding_resolution_ports";
import type { BugbotContext } from "./types";
import {
  prepareBugbotFindings,
  type PreparedBugbotFindings,
} from "./prepare_bugbot_findings";
import { markFindingsResolved } from "./mark_findings_resolved_use_case";
import { publishFindings } from "./publish_findings_use_case";
import { BUGBOT_MAX_COMMENTS } from "../../../../../utils/constants";
import { PullRequestReviewOperationError } from "../../../../../application/ports/pull_request_review_errors";

export function prepareDetectedFindings(
  execution: Execution,
  response: unknown,
): PreparedBugbotFindings | undefined {
  return prepareBugbotFindings(
    response,
    execution.ai?.getAiIgnoreFiles?.() ?? [],
    execution.ai?.getBugbotMinSeverity?.(),
    execution.ai?.getBugbotCommentLimit?.() ?? BUGBOT_MAX_COMMENTS,
  );
}

export async function applyDetectedFindings(
  execution: Execution,
  context: BugbotContext,
  prepared: PreparedBugbotFindings,
  publicationPorts: BugbotFindingPublicationPorts,
  resolutionPorts: BugbotFindingResolutionPorts,
): Promise<Error[]> {
  try {
    await publishFindings({
      execution,
      context,
      findings: prepared.toPublish,
      commitSha: context.prContext?.prHeadSha ?? "",
      overflowCount:
        prepared.overflowCount > 0 ? prepared.overflowCount : undefined,
      overflowTitles:
        prepared.overflowCount > 0 ? prepared.overflowTitles : undefined,
      ports: publicationPorts,
    });
  } catch (error) {
    const publicationError =
      error instanceof PullRequestReviewOperationError
        ? error
        : new Error("Unable to publish findings.");
    return [publicationError];
  }
  const resolutionErrors = await markFindingsResolved({
    execution,
    context,
    resolvedFindingIds: prepared.resolvedFindingIds,
    ports: resolutionPorts,
  });
  return resolutionErrors;
}
