export type PullRequestReviewComment = {
    /** Event-facing numeric reference retained only for point lookups. */
    id: number;
    /** Lossless opaque identity used by mutations and thread lookup. */
    identity: string;
    body: string | null;
    path?: string;
    line?: number;
    authorLogin?: string;
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
    listPullRequestReviewComments(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<PullRequestReviewComment[]>;
}
export interface PullRequestReviewCommentBodyQueryPort {
    getPullRequestReviewCommentBody(owner: string, repository: string, pullRequestNumber: number, commentId: number, token: string): Promise<string | null>;
}
export interface PullRequestReviewCommentQueryPort extends PullRequestReviewCommentListQueryPort, PullRequestReviewCommentBodyQueryPort {
}
export interface PullRequestReviewCommentCreatePort {
    createReviewWithComments(owner: string, repository: string, pullRequestNumber: number, commitId: string, body: string, comments: PullRequestReviewCommentDraft[], token: string): Promise<void>;
}
export interface PullRequestReviewCommentUpdatePort {
    updatePullRequestReviewComment(owner: string, repository: string, commentIdentity: string, body: string, token: string): Promise<void>;
}
export interface PullRequestReviewCommentCommandPort extends PullRequestReviewCommentCreatePort, PullRequestReviewCommentUpdatePort {
}
export interface PullRequestReviewThreadCommandPort {
    resolvePullRequestReviewThread(owner: string, repository: string, pullRequestNumber: number, commentIdentity: string, token: string): Promise<void>;
    unresolvePullRequestReviewThread(owner: string, repository: string, pullRequestNumber: number, commentIdentity: string, token: string): Promise<void>;
}
export interface PullRequestReviewThreadStateQueryPort {
    /** Maps review-comment node identities to their parent thread resolution state. */
    listPullRequestReviewThreadStates(owner: string, repository: string, pullRequestNumber: number, token: string): Promise<Record<string, boolean>>;
}
