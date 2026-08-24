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
        iterator<T>(method: (parameters: Record<string, unknown>) => Promise<{
            data: T;
        }>, parameters: Record<string, unknown>): AsyncIterable<{
            data: T;
        }>;
    };
    rest: {
        pulls: {
            listRequestedReviewers(parameters: Record<string, unknown>): Promise<{
                data: GithubRequestedReviewersPage;
            }>;
            listReviews(parameters: Record<string, unknown>): Promise<{
                data: GithubReview[];
            }>;
            requestReviewers(parameters: Record<string, unknown>): Promise<{
                data: {
                    requested_reviewers?: GithubReviewUser[] | null;
                };
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
}
export interface GithubPullRequestReviewCommentQueryClient {
    paginate: {
        iterator<T>(method: (parameters: Record<string, unknown>) => Promise<{
            data: T;
        }>, parameters: Record<string, unknown>): AsyncIterable<{
            data: T;
        }>;
    };
    rest: {
        pulls: {
            getReviewComment(parameters: Record<string, unknown>): Promise<{
                data: GithubReviewComment;
            }>;
            listReviewComments(parameters: Record<string, unknown>): Promise<{
                data: GithubReviewComment[];
            }>;
        };
    };
}
export interface GithubPullRequestReviewCommentCreateClient {
    rest: {
        pulls: {
            createReviewComment(parameters: Record<string, unknown>): Promise<{
                data: unknown;
            }>;
        };
    };
}
/** Shared route-scoped provider lifecycle, projected to narrow adapter protocols. */
export type GithubPullRequestReviewCommentClient = GithubPullRequestReviewCommentQueryClient & GithubPullRequestReviewCommentCreateClient;
