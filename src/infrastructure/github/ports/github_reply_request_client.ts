interface CommentParameters {
    owner: string;
    repo: string;
    comment_id: number;
    request: { redirect: 'error' };
}
interface CommentResponse { url: unknown; data: unknown }
/** Only the two native source-comment reads; no publication or file authority. */
export interface GithubReplyRequestClient {
    readonly rest: {
        readonly issues: { getComment(parameters: CommentParameters): Promise<CommentResponse> };
        readonly pulls: { getReviewComment(parameters: CommentParameters): Promise<CommentResponse> };
    };
}
