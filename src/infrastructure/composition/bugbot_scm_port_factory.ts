import type { BugbotScmPorts } from '../../application/ports/bugbot_scm_ports';
import type { BugbotRuleFileQueryPort } from '../../application/ports/bugbot_rule_ports';
import type { BugbotIssueRepository } from '../../data/repository/issue/bugbot_issue_repository';
import type { BugbotIssueCommentQueryRepository } from '../../data/repository/issue/bugbot_issue_comment_query_repository';
import type { BugbotPullRequestRepository } from '../../data/repository/pull_request/bugbot_pull_request_repository';
import type { PullRequestChangesRepository } from '../../data/repository/pull_request/pull_request_changes_repository';
import type { PullRequestLifecycleRepository } from '../../data/repository/pull_request/pull_request_lifecycle_repository';
import type { PullRequestReviewCommentQueryRepository } from '../../data/repository/pull_request/pull_request_review_comment_query_repository';
import type { PullRequestReviewThreadRepository } from '../../data/repository/pull_request/pull_request_review_thread_repository';
import type { GithubBugbotReviewNavigationAdapter } from '../github/github_bugbot_review_navigation_adapter';

export interface BugbotScmBinding {
  readonly owner: string;
  readonly repository: string;
  readonly token: string;
}

/** Binds repository identity and credential once, outside application workflows. */
export class BugbotScmPortFactory {
  constructor(
    private readonly boundedIssues: BugbotIssueCommentQueryRepository,
    private readonly issues: BugbotIssueRepository,
    private readonly lifecycle: PullRequestLifecycleRepository,
    private readonly changes: PullRequestChangesRepository,
    private readonly pullRequests: BugbotPullRequestRepository,
    private readonly reviewComments: PullRequestReviewCommentQueryRepository,
    private readonly reviewThreads: PullRequestReviewThreadRepository,
    private readonly rules: BugbotRuleFileQueryPort,
    private readonly navigation: GithubBugbotReviewNavigationAdapter,
  ) {}

  bind(binding: BugbotScmBinding): BugbotScmPorts {
    const { owner, repository, token } = binding;
    const context = {
      getPullRequest: (pullRequestNumber: number) =>
        this.lifecycle.getBugbotPullRequestIdentity(owner, repository, pullRequestNumber, token),
      findOpenPullRequestsByExactHead: (headOwner: string, headRef: string) =>
        this.lifecycle.findOpenBugbotPullRequestsByExactHead(owner, repository, headOwner, headRef, token),
      listIssueComments: async (issueNumber: number) => {
        const result = await this.boundedIssues.listBugbotIssueCommentsBounded(
          owner,
          repository,
          issueNumber,
          token,
        );
        return { value: result.items, coverage: result.coverage };
      },
      listPullRequestReviewComments: async (pullRequestNumber: number) => {
        const result = await this.reviewComments.listBugbotPullRequestReviewCommentsBounded(
          owner,
          repository,
          pullRequestNumber,
          token,
        );
        return { value: result.items, coverage: result.coverage };
      },
      listPullRequestReviewThreadStates: async (pullRequestNumber: number) => {
        const result = await this.reviewThreads.listBugbotPullRequestReviewThreadStatesBounded(
          owner,
          repository,
          pullRequestNumber,
          token,
        );
        return { value: result.states, coverage: result.coverage };
      },
      getReviewDiffSnapshot: async (pullRequestNumber: number) => {
        const result = await this.changes.getBoundedBugbotReviewDiffSnapshot(
          owner,
          repository,
          pullRequestNumber,
          token,
        );
        return { value: result.snapshot, coverage: result.coverage };
      },
      getPullRequestHeadSha: (pullRequestNumber: number) =>
        this.changes.getPullRequestHeadSha(owner, repository, pullRequestNumber, token),
      getPullRequestReviewCommentBody: (pullRequestNumber: number, commentId: number) =>
        this.pullRequests.getPullRequestReviewCommentBody(
          owner,
          repository,
          pullRequestNumber,
          commentId,
          token,
        ),
      loadRules: (paths: readonly string[]) => this.rules.loadRules(paths),
    };
    const issueComments = {
      addComment: (issueNumber: number, body: string, options?: { commitSha?: string }) =>
        this.issues.addComment(owner, repository, issueNumber, body, token, options),
      updateComment: (
        issueNumber: number,
        commentId: number,
        body: string,
        options?: { commitSha?: string },
      ) => this.issues.updateComment(owner, repository, issueNumber, commentId, body, token, options),
    };
    const pullRequestComments = {
      createReviewWithComments: (
        pullRequestNumber: number,
        commitId: string,
        body: string,
        comments: Parameters<BugbotPullRequestRepository['createReviewWithComments']>[5],
      ) => this.pullRequests.createReviewWithComments(
        owner,
        repository,
        pullRequestNumber,
        commitId,
        body,
        comments,
        token,
      ),
      updatePullRequestReviewComment: (commentIdentity: string, body: string) =>
        this.pullRequests.updatePullRequestReviewComment(owner, repository, commentIdentity, body, token),
      resolvePullRequestReviewThread: (pullRequestNumber: number, commentIdentity: string) =>
        this.pullRequests.resolvePullRequestReviewThread(
          owner,
          repository,
          pullRequestNumber,
          commentIdentity,
          token,
        ),
      unresolvePullRequestReviewThread: (pullRequestNumber: number, commentIdentity: string) =>
        this.pullRequests.unresolvePullRequestReviewThread(
          owner,
          repository,
          pullRequestNumber,
          commentIdentity,
          token,
        ),
      listPullRequestReviewComments: (pullRequestNumber: number) =>
        this.pullRequests.listPullRequestReviewComments(owner, repository, pullRequestNumber, token),
    };

    return {
      context,
      publication: { issueComments, pullRequestComments },
      resolution: { issueComments, pullRequestComments },
      reconciliation: {
        snapshot: {
          listIssueComments: (issueNumber) =>
            this.issues.listIssueComments(owner, repository, issueNumber, token),
          listPullRequestReviewComments: (pullRequestNumber) =>
            this.pullRequests.listPullRequestReviewComments(owner, repository, pullRequestNumber, token),
          listPullRequestReviewThreadStates: (pullRequestNumber) =>
            this.pullRequests.listPullRequestReviewThreadStates(owner, repository, pullRequestNumber, token),
          listPullRequestReviews: (pullRequestNumber) =>
            this.pullRequests.listPullRequestReviews(owner, repository, pullRequestNumber, token),
          getPullRequestHeadSha: (pullRequestNumber) =>
            this.pullRequests.getPullRequestHeadSha(owner, repository, pullRequestNumber, token),
          navigationForPullRequest: (pullRequestNumber, headSha) =>
            this.navigation.forPullRequest(owner, repository, pullRequestNumber, headSha),
        },
        presentation: {
          comments: issueComments,
          updatePullRequestReview: (pullRequestNumber, reviewIdentity, body) =>
            this.pullRequests.updatePullRequestReview(
              owner,
              repository,
              pullRequestNumber,
              reviewIdentity,
              body,
              token,
            ),
        },
      },
    };
  }
}
