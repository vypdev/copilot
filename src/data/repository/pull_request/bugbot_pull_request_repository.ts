import type { BugbotPullRequestWritePort } from "../../../application/ports/bugbot_pull_request_write_ports";
import type { BugbotPullRequestResolutionPort } from "../../../application/ports/bugbot_pull_request_resolution_ports";
import type { BugbotPullRequestReadPort } from "../../../application/ports/bugbot_pull_request_read_ports";
import type {
  PullRequestReviewComment,
  PullRequestReviewCommentCommandPort,
  PullRequestReviewCommentQueryPort,
  PullRequestReviewThreadCommandPort,
} from "../../../application/ports/pull_request_review_comment_ports";
export class BugbotPullRequestRepository
  implements
    BugbotPullRequestReadPort,
    BugbotPullRequestWritePort,
    BugbotPullRequestResolutionPort
{
  constructor(
    private readonly lifecycle: Pick<BugbotPullRequestReadPort, "getHeadBranchForIssue" | "getOpenPullRequestNumbersByHeadBranch">,
    private readonly changes: Pick<BugbotPullRequestReadPort, "getPullRequestHeadSha" | "getChangedFiles" | "getFilesWithFirstDiffLine">,
    private readonly reviewQuery: PullRequestReviewCommentQueryPort,
    private readonly reviewCommand: PullRequestReviewCommentCommandPort,
    private readonly threadCommand: PullRequestReviewThreadCommandPort,
  ) {}

  getHeadBranchForIssue = (
    ...args: Parameters<BugbotPullRequestReadPort["getHeadBranchForIssue"]>
  ) => this.lifecycle.getHeadBranchForIssue(...args);
  getOpenPullRequestNumbersByHeadBranch = (
    ...args: Parameters<
      BugbotPullRequestReadPort["getOpenPullRequestNumbersByHeadBranch"]
    >
  ) => this.lifecycle.getOpenPullRequestNumbersByHeadBranch(...args);
  getPullRequestReviewCommentBody = (
    ...args: Parameters<
      BugbotPullRequestReadPort["getPullRequestReviewCommentBody"]
    >
  ) => this.reviewQuery.getPullRequestReviewCommentBody(...args);
  listPullRequestReviewComments = (
    ...args: Parameters<
      BugbotPullRequestReadPort["listPullRequestReviewComments"]
    >
  ): Promise<PullRequestReviewComment[]> =>
    this.reviewQuery.listPullRequestReviewComments(...args);
  getPullRequestHeadSha = (
    ...args: Parameters<BugbotPullRequestReadPort["getPullRequestHeadSha"]>
  ) => this.changes.getPullRequestHeadSha(...args);
  getChangedFiles = (
    ...args: Parameters<BugbotPullRequestReadPort["getChangedFiles"]>
  ) => this.changes.getChangedFiles(...args);
  getFilesWithFirstDiffLine = (
    ...args: Parameters<BugbotPullRequestReadPort["getFilesWithFirstDiffLine"]>
  ) => this.changes.getFilesWithFirstDiffLine(...args);
  createReviewWithComments = (
    ...args: Parameters<BugbotPullRequestWritePort["createReviewWithComments"]>
  ) => this.reviewCommand.createReviewWithComments(...args);
  updatePullRequestReviewComment = (
    ...args: Parameters<
      BugbotPullRequestWritePort["updatePullRequestReviewComment"]
    >
  ) => this.reviewCommand.updatePullRequestReviewComment(...args);
  resolvePullRequestReviewThread = (
    ...args: Parameters<
      BugbotPullRequestResolutionPort["resolvePullRequestReviewThread"]
    >
  ) => this.threadCommand.resolvePullRequestReviewThread(...args);

  unresolvePullRequestReviewThread = (
    ...args: Parameters<BugbotPullRequestResolutionPort["unresolvePullRequestReviewThread"]>
  ) => this.threadCommand.unresolvePullRequestReviewThread(...args);
}
