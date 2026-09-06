import type { PullRequestReviewComment } from '../../../../ports/pull_request_review_comment_ports';
import type { BugbotComment } from './bugbot_finding_context';
import type { BugbotPrContext } from './types';
export declare function buildReviewDiffBlock(context: BugbotPrContext | null): string;
export declare function buildReviewConversationBlock(issueComments: readonly BugbotComment[], commentsByPullRequest: ReadonlyMap<number, PullRequestReviewComment[]>, botLogin?: string): string;
