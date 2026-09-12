export interface GithubReviewUser {
  login: string;
}

export interface GithubReview {
  state?: string | null;
  user?: GithubReviewUser | null;
}

export interface GithubRequestedReviewersPage {
  users: GithubReviewUser[];
}

export interface GithubPullRequestReviewerClient {
  paginate: {
    iterator<T>(
      method: (parameters: Record<string, unknown>) => Promise<{ data: T }>,
      parameters: Record<string, unknown>,
    ): AsyncIterable<{ data: T }>;
  };
  rest: {
    pulls: {
      listRequestedReviewers(
        parameters: Record<string, unknown>,
      ): Promise<{ data: GithubRequestedReviewersPage }>;
      listReviews(
        parameters: Record<string, unknown>,
      ): Promise<{ data: GithubReview[] }>;
      requestReviewers(parameters: Record<string, unknown>): Promise<{
        data: { requested_reviewers?: GithubReviewUser[] | null };
      }>;
    };
  };
}

export interface GithubReviewComment {
  id: number;
  node_id: string;
  body?: string | null;
  path?: string;
  line?: number | null;
  user?: { login?: string | null } | null;
  pull_request_review_id?: number | null;
  html_url?: string | null;
  created_at?: string | null;
}

export interface GithubPullRequestReview {
  id: number;
  body?: string | null;
  user?: { login?: string | null } | null;
  commit_id?: string | null;
  html_url?: string | null;
}

export interface GithubPullRequestReviewCommentQueryClient {
  paginate: {
    iterator<T>(
      method: (parameters: Record<string, unknown>) => Promise<{ data: T }>,
      parameters: Record<string, unknown>,
    ): AsyncIterable<{ data: T }>;
  };
  rest: {
    pulls: {
      getReviewComment(
        parameters: Record<string, unknown>,
      ): Promise<{ data: GithubReviewComment }>;
      listReviewComments(
        parameters: Record<string, unknown>,
      ): Promise<{ data: GithubReviewComment[] }>;
      listReviews(
        parameters: Record<string, unknown>,
      ): Promise<{ data: GithubPullRequestReview[] }>;
    };
  };
}

export interface GithubPullRequestReviewCommentCreateClient {
  rest: {
    pulls: {
      createReview(
        parameters: Record<string, unknown>,
      ): Promise<{ data: GithubPullRequestReview }>;
      updateReview(
        parameters: Record<string, unknown>,
      ): Promise<{ data: GithubPullRequestReview }>;
    };
  };
}

/** Shared route-scoped provider lifecycle, projected to narrow adapter protocols. */
export type GithubPullRequestReviewCommentClient =
  GithubPullRequestReviewCommentQueryClient &
    GithubPullRequestReviewCommentCreateClient;
