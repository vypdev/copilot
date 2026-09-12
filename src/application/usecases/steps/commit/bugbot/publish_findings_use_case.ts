/**
 * Orchestrates publication of bugbot findings to issue comments and PR review comments.
 * Issue publication, PR review policy, and overflow reporting live in dedicated collaborators.
 */

import type { BugbotFindingPublicationPorts } from "../../../../../application/ports/bugbot_finding_publication_ports";
import { getCommentWatermark } from "../../../../../utils/comment_watermark";
import type { BugbotContext } from "./types";
import {
    findExistingFindingInfo,
    type BugbotFinding,
} from "../../../../../domain/bugbot/finding";
import { publishIssueFindingComment } from "./publish_issue_finding_comment";
import { PullRequestReviewCommentPublisher } from "./publish_pr_review_comments";
import { publishOverflowComment } from "./publish_overflow_comment";
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';

export interface PublishFindingsParam {
    operation: BugbotReviewOperationContext;
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
    const { operation, context, findings, commitSha, overflowCount = 0, overflowTitles = [], ports } = param;
    const { existingByFindingId, canonicalPullRequest, prContext } = context;

    const watermark =
        commitSha
            ? getCommentWatermark({ commitSha, owner: operation.repository.owner, repo: operation.repository.name })
            : getCommentWatermark();

    const reviewPublisher =
        prContext && canonicalPullRequest
            ? new PullRequestReviewCommentPublisher({
                  repository: ports.pullRequestComments,
                  operation,
                  openPrNumber: canonicalPullRequest.number,
                  prContext,
                  watermark,
                  ruleSources: context.reviewRuleSources,
                  omittedRuleCount: context.omittedReviewRules,
              })
            : undefined;

    for (const finding of findings) {
        if (operation.target.issueNumber > 0 && !reviewPublisher) {
            await publishIssueFindingComment(
                ports.issueComments,
                operation.target.issueNumber,
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
    if (operation.target.issueNumber > 0 && !reviewPublisher) {
        await publishOverflowComment(
            ports.issueComments,
            operation.target.issueNumber,
            overflowCount,
            overflowTitles,
            commitSha
        );
    }
}
