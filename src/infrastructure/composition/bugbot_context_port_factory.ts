import type {
  BoundBugbotContextReadPorts,
  BugbotContextReadPortFactory,
} from '../../application/ports/bugbot_context_ports';
import type { BugbotRuleFileQueryPort } from '../../application/ports/bugbot_rule_ports';
import type { BugbotIssueCommentQueryRepository } from '../../data/repository/issue/bugbot_issue_comment_query_repository';
import type { PullRequestChangesRepository } from '../../data/repository/pull_request/pull_request_changes_repository';
import type { PullRequestLifecycleRepository } from '../../data/repository/pull_request/pull_request_lifecycle_repository';
import type { PullRequestReviewCommentQueryRepository } from '../../data/repository/pull_request/pull_request_review_comment_query_repository';
import type { PullRequestReviewThreadRepository } from '../../data/repository/pull_request/pull_request_review_thread_repository';

/** Binds route credentials once and exposes only semantic, repository-scoped reads. */
export class BugbotContextPortFactory implements BugbotContextReadPortFactory {
  constructor(
    private readonly issues: BugbotIssueCommentQueryRepository,
    private readonly lifecycle: PullRequestLifecycleRepository,
    private readonly changes: PullRequestChangesRepository,
    private readonly reviewComments: PullRequestReviewCommentQueryRepository,
    private readonly reviewThreads: PullRequestReviewThreadRepository,
    private readonly rules: BugbotRuleFileQueryPort,
  ) {}

  bind(binding: {
    readonly owner: string;
    readonly repository: string;
    readonly token: string;
  }): BoundBugbotContextReadPorts {
    const { owner, repository, token } = binding;
    return {
      getPullRequest: (pullRequestNumber) =>
        this.lifecycle.getBugbotPullRequestIdentity(owner, repository, pullRequestNumber, token),
      findOpenPullRequestsByExactHead: (headOwner, headRef) =>
        this.lifecycle.findOpenBugbotPullRequestsByExactHead(owner, repository, headOwner, headRef, token),
      listIssueComments: async (issueNumber) => {
        const result = await this.issues.listBugbotIssueCommentsBounded(owner, repository, issueNumber, token);
        return { value: result.items, coverage: result.coverage };
      },
      listPullRequestReviewComments: async (pullRequestNumber) => {
        const result = await this.reviewComments.listBugbotPullRequestReviewCommentsBounded(
          owner,
          repository,
          pullRequestNumber,
          token,
        );
        return { value: result.items, coverage: result.coverage };
      },
      listPullRequestReviewThreadStates: async (pullRequestNumber) => {
        const result = await this.reviewThreads.listBugbotPullRequestReviewThreadStatesBounded(
          owner,
          repository,
          pullRequestNumber,
          token,
        );
        return { value: result.states, coverage: result.coverage };
      },
      getReviewDiffSnapshot: async (pullRequestNumber) => {
        const result = await this.changes.getBoundedBugbotReviewDiffSnapshot(
          owner,
          repository,
          pullRequestNumber,
          token,
        );
        return { value: result.snapshot, coverage: result.coverage };
      },
      getPullRequestHeadSha: (pullRequestNumber) =>
        this.changes.getPullRequestHeadSha(owner, repository, pullRequestNumber, token),
      loadRules: (paths) => this.rules.loadRules(paths),
    };
  }
}
