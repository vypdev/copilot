export type PullRequestReviewComment = {
  /** Event-facing numeric reference retained only for point lookups. */
  id: number;
  /** Lossless opaque identity used by mutations and thread lookup. */
  identity: string;
  body: string | null;
  path?: string;
  line?: number;
  authorLogin?: string;
  createdAt?: string;
  /** Opaque identity of the submitted review that owns this comment. */
  parentReviewIdentity?: string;
  /** Safe provider URL for user-facing navigation. */
  url?: string;
};

export type PullRequestReviewSummary = {
  /** Lossless opaque provider identity used by mutations. */
  identity: string;
  body: string | null;
  authorLogin?: string;
  commitId?: string;
  url?: string;
};

export type PullRequestReviewReference = {
  identity: string;
  url?: string;
};

export type PullRequestReviewCommentDraft = {
  path: string;
  body: string;
  line?: number;
  side?: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  subjectType?: "line" | "file";
};

export interface PullRequestReviewCommentListQueryPort {
  listPullRequestReviewComments(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token: string,
  ): Promise<PullRequestReviewComment[]>;
}

export interface PullRequestReviewCommentBodyQueryPort {
  getPullRequestReviewCommentBody(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    commentId: number,
    token: string,
  ): Promise<string | null>;
}

export interface PullRequestReviewCommentQueryPort
  extends
    PullRequestReviewCommentListQueryPort,
    PullRequestReviewCommentBodyQueryPort {}

export interface PullRequestReviewCommentCreatePort {
  createReviewWithComments(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    commitId: string,
    body: string,
    comments: PullRequestReviewCommentDraft[],
    token: string,
  ): Promise<PullRequestReviewReference | undefined>;
}

export interface PullRequestReviewCommentUpdatePort {
  updatePullRequestReviewComment(
    owner: string,
    repository: string,
    commentIdentity: string,
    body: string,
    token: string,
  ): Promise<void>;
}

export interface PullRequestReviewCommentCommandPort
  extends
    PullRequestReviewCommentCreatePort,
    PullRequestReviewCommentUpdatePort {}

export interface PullRequestReviewSummaryQueryPort {
  listPullRequestReviews(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token: string,
  ): Promise<PullRequestReviewSummary[]>;
}

export interface PullRequestReviewSummaryUpdatePort {
  updatePullRequestReview(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    reviewIdentity: string,
    body: string,
    token: string,
  ): Promise<void>;
}

export interface PullRequestReviewThreadCommandPort {
  resolvePullRequestReviewThread(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    commentIdentity: string,
    token: string,
  ): Promise<void>;

  unresolvePullRequestReviewThread(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    commentIdentity: string,
    token: string,
  ): Promise<void>;
}

export interface PullRequestReviewThreadStateQueryPort {
  /** Maps review-comment node identities to their parent thread resolution state. */
  listPullRequestReviewThreadStates(
    owner: string,
    repository: string,
    pullRequestNumber: number,
    token: string,
  ): Promise<Record<string, PullRequestReviewThreadState>>;
}

export interface PullRequestReviewThreadState {
  resolved: boolean;
  resolvedByLogin?: string;
}
