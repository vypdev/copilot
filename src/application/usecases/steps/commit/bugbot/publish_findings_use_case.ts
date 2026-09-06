/**
 * Orchestrates publication of bugbot findings to issue comments and PR review comments.
 * Issue publication, PR review policy, and overflow reporting live in dedicated collaborators.
 */

import type { Execution } from "../../../../../data/model/execution";
import type { BugbotFindingPublicationPorts } from "../../../../../application/ports/bugbot_finding_publication_ports";
import { getCommentWatermark } from "../../../../../utils/comment_watermark";
import { findExistingFindingInfo, type BugbotContext, type BugbotFinding } from "./types";
import { publishIssueFindingComment } from "./publish_issue_finding_comment";
import { PullRequestReviewCommentPublisher } from "./publish_pr_review_comments";
import { publishOverflowComment } from "./publish_overflow_comment";

export interface PublishFindingsParam {
    execution: Execution;
    context: BugbotContext;
    findings: BugbotFinding[];
    /** Commit SHA for bugbot watermark (commit link). When set, comment uses "for commit ..." watermark. */
    commitSha?: string;
    /** When findings were limited by max comments, add one summary comment with this overflow info. */
    overflowCount?: number;
    overflowTitles?: string[];
    ports: BugbotFindingPublicationPorts;
}

export async function publishFindings(param: PublishFindingsParam): Promise<void> {
    const { execution, context, findings, commitSha, overflowCount = 0, overflowTitles = [], ports } = param;
    const { existingByFindingId, openPrNumbers, prContext } = context;

    const watermark =
        commitSha && execution.owner && execution.repo
            ? getCommentWatermark({ commitSha, owner: execution.owner, repo: execution.repo })
            : getCommentWatermark();

    const reviewPublisher =
        prContext && openPrNumbers.length > 0
            ? new PullRequestReviewCommentPublisher({
                  repository: ports.pullRequestComments,
                  execution,
                  openPrNumber: openPrNumbers[0],
                  prContext,
                  watermark,
              })
            : undefined;

    for (const finding of findings) {
        if (execution.issueNumber > 0 && !reviewPublisher) {
            await publishIssueFindingComment(
                ports.issueComments,
                execution,
                finding,
                findExistingFindingInfo(existingByFindingId, finding),
                commitSha
            );
        }
        if (reviewPublisher) {
            await reviewPublisher.publish(finding, findExistingFindingInfo(existingByFindingId, finding));
        }
    }

    await reviewPublisher?.flush(overflowCount, overflowTitles);
    if (execution.issueNumber > 0 && !reviewPublisher) {
        await publishOverflowComment(
            ports.issueComments,
            execution,
            overflowCount,
            overflowTitles,
            commitSha
        );
    }
}
