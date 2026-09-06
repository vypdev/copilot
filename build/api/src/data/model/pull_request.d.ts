import type { ExecutionInputs } from './execution_inputs';
export declare class PullRequest {
    desiredAssigneesCount: number;
    desiredReviewersCount: number;
    mergeTimeout: number;
    inputs: ExecutionInputs | undefined;
    get action(): string;
    get id(): string;
    get title(): string;
    get creator(): string;
    get number(): number;
    get url(): string;
    get body(): string;
    get head(): string;
    get base(): string;
    get isMerged(): boolean;
    get opened(): boolean;
    get isOpened(): boolean;
    get isClosed(): boolean;
    get isSynchronize(): boolean;
    get isPullRequest(): boolean;
    get isPullRequestReviewComment(): boolean;
    /** Review comment: GitHub sends it as payload.comment for pull_request_review_comment event. */
    private get reviewCommentPayload();
    get commentId(): number;
    get commentBody(): string;
    get commentAuthor(): string;
    get commentUrl(): string;
    /** When the comment is a reply, the id of the parent review comment (for bugbot: include parent body in intent prompt). */
    get commentInReplyToId(): number | undefined;
    constructor(desiredAssigneesCount: number, desiredReviewersCount: number, mergeTimeout: number, inputs?: ExecutionInputs | undefined);
}
