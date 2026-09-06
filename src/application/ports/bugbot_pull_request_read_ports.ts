import type { PullRequestReviewComment } from "./pull_request_review_comment_ports";

export interface PullRequestDiffLocation {
  line: number;
  side: "LEFT" | "RIGHT";
}

export interface PullRequestReviewChange {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface PullRequestReviewDiffSnapshot {
  changes: PullRequestReviewChange[];
  filesWithFirstDiffLine: Array<{ path: string; firstLine: number }>;
  filesWithDiffLocations: Array<{ path: string; locations: PullRequestDiffLocation[] }>;
}

export interface BugbotPullRequestQueryPort {
  getHeadBranchForIssue(
    owner: string,
    repository: string,
    issueNumber: number,
    token: string,
  ): Promise<string | undefined>;
  getPullRequestReviewCommentBody(
    owner: string,
    repository: string,
    pullNumber: number,
    commentId: number,
    token: string,
  ): Promise<string | null>;
}

export interface BugbotPullRequestReadPort extends BugbotPullRequestQueryPort {
  getOpenPullRequestNumbersByHeadBranch(
    owner: string,
    repository: string,
    branch: string,
    token: string,
  ): Promise<number[]>;
  listPullRequestReviewComments(
    owner: string,
    repository: string,
    pullNumber: number,
    token: string,
  ): Promise<PullRequestReviewComment[]>;
  getPullRequestHeadSha(
    owner: string,
    repository: string,
    pullNumber: number,
    token: string,
  ): Promise<string | undefined>;
  getChangedFiles(
    owner: string,
    repository: string,
    pullNumber: number,
    token: string,
  ): Promise<Array<{ filename: string; status: string }>>;
  getFilesWithFirstDiffLine(
    owner: string,
    repository: string,
    pullNumber: number,
    token: string,
  ): Promise<Array<{ path: string; firstLine: number }>>;
  getFilesWithDiffLocations?(
    owner: string,
    repository: string,
    pullNumber: number,
    token: string,
  ): Promise<Array<{ path: string; locations: PullRequestDiffLocation[] }>>;
  /** Loads all diff projections from one paginated GitHub request. */
  getReviewDiffSnapshot?(
    owner: string,
    repository: string,
    pullNumber: number,
    token: string,
  ): Promise<PullRequestReviewDiffSnapshot>;
  listPullRequestReviewThreadStates?(
    owner: string,
    repository: string,
    pullNumber: number,
    token: string,
  ): Promise<Record<string, boolean>>;
}
