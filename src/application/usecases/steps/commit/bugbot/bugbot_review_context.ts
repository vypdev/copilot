import { githubUsersMatch } from '../../../../../domain/github_user_policy';
import type { PullRequestReviewComment } from '../../../../ports/pull_request_review_comment_ports';
import type { BugbotComment } from './bugbot_finding_context';
import type { BugbotPrContext } from './types';
import { packReviewConversation, type ConversationSource } from '../../../../policies/bugbot_conversation_packing_policy';
import { buildReviewDiffPlan } from '../../../../policies/bugbot_diff_partition_policy';

export function buildReviewDiffBlock(
  context: BugbotPrContext | null,
  ignorePatterns: readonly string[] = [],
): string {
  return buildReviewDiffPlan(context, ignorePatterns).partitions.map((partition) => partition.block).join('\n\n');
}

export interface BuiltBugbotPromptContext {
  readonly block: string;
  readonly omitted: number;
  readonly truncated: number;
  readonly retained: number;
  readonly truncatedItemIds?: readonly string[];
}

export function buildReviewDiffContext(
  context: BugbotPrContext | null,
  ignorePatterns: readonly string[] = [],
): BuiltBugbotPromptContext {
  const plan = buildReviewDiffPlan(context, ignorePatterns);
  return {
    block: plan.partitions.map((partition) => partition.block).join('\n\n'),
    omitted: 0,
    truncated: 0,
    retained: plan.retained,
  };
}

export function buildReviewConversationBlock(
  issueComments: readonly BugbotComment[],
  commentsByPullRequest: ReadonlyMap<number, PullRequestReviewComment[]>,
  botLogin?: string,
): string {
  return buildReviewConversationContext(issueComments, commentsByPullRequest, botLogin).block;
}

export function buildReviewConversationContext(
  issueComments: readonly BugbotComment[],
  commentsByPullRequest: ReadonlyMap<number, PullRequestReviewComment[]>,
  botLogin?: string,
): BuiltBugbotPromptContext {
  const entries: ConversationSource[] = [];
  for (const comment of issueComments) {
    if (comment.isAutomatedAuthor || isBot(comment.user?.login, botLogin)) continue;
    appendConversationEntry(
      entries,
      comment.user?.login,
      'general PR/issue comment',
      comment.body,
      comment.createdAt,
      `issue:${comment.id}`,
    );
  }
  for (const comments of commentsByPullRequest.values()) {
    for (const comment of comments) {
      if (comment.isAutomatedAuthor || isBot(comment.authorLogin, botLogin)) continue;
      const location = comment.path
        ? `inline review comment at ${comment.path}${comment.line ? `:${comment.line}` : ''}`
        : 'inline review comment';
      appendConversationEntry(
        entries,
        comment.authorLogin,
        location,
        comment.body,
        comment.createdAt,
        `review:${comment.identity}`,
      );
    }
  }
  return packReviewConversation(entries);
}

function appendConversationEntry(
  entries: ConversationSource[], author: string | undefined, kind: string,
  body: string | null | undefined, createdAt: string | undefined, providerId: string,
): void {
  entries.push({ author, kind, body, createdAt, providerId });
}

function isBot(author: string | undefined, botLogin: string | undefined): boolean {
  const normalizedBotLogin = botLogin?.trim() ?? '';
  return normalizedBotLogin.length > 0 && githubUsersMatch(author ?? '', normalizedBotLogin);
}
