import type { Execution } from '../../../../data/model/execution';
import { extractMentionQuestion, getThinkCommentBody } from './think_input_policy';

export type ThinkRequestDecision =
    | { kind: 'skip'; reason: 'empty-comment' | 'missing-token' | 'not-mentioned' | 'empty-question' }
    | {
        kind: 'ready';
        commentBody: string;
        question: string;
        issueNumberForContext: number;
        destinationNumber: number;
        destinationType: 'issue' | 'PR';
    };

/** Resolves the comment input and destination without performing I/O. */
export function resolveThinkRequest(
    param: Pick<Execution, 'issue' | 'pullRequest' | 'issueNumber' | 'tokenUser'>,
): ThinkRequestDecision {
    const commentBody = getThinkCommentBody({
        issueCommentBody: param.issue.commentBody,
        pullRequestReviewCommentBody: param.pullRequest.commentBody,
        isIssueComment: param.issue.isIssueComment,
        isPullRequestReviewComment: param.pullRequest.isPullRequestReviewComment,
    });
    if (!commentBody.trim()) return { kind: 'skip', reason: 'empty-comment' };
    if (!param.tokenUser?.trim()) return { kind: 'skip', reason: 'missing-token' };
    if (!commentBody.includes(`@${param.tokenUser}`)) return { kind: 'skip', reason: 'not-mentioned' };

    const question = extractMentionQuestion(commentBody, param.tokenUser);
    if (!question) return { kind: 'skip', reason: 'empty-question' };

    const isIssueComment = param.issue.isIssueComment;
    return {
        kind: 'ready',
        commentBody,
        question,
        issueNumberForContext: isIssueComment ? param.issue.number : param.issueNumber,
        destinationNumber: isIssueComment ? param.issue.number : param.pullRequest.number,
        destinationType: isIssueComment ? 'issue' : 'PR',
    };
}
