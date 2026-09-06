import type { EventCommentPayload, ExecutionInputs } from './execution_inputs';
import { parsePositiveSafeInteger } from '../../domain/positive_integer_policy';

export class PullRequest {
    desiredAssigneesCount: number;
    desiredReviewersCount: number;
    mergeTimeout: number;
    inputs: ExecutionInputs | undefined = undefined;

    get action(): string {
        return this.inputs?.action ?? '';
    }

    get id(): string {
        return this.inputs?.pull_request?.node_id ?? '';
    }

    get title(): string {
        return this.inputs?.pull_request?.title ?? '';
    }

    get creator(): string {
        return this.inputs?.pull_request?.user?.login ?? '';
    }

    get number(): number {
        return parsePositiveSafeInteger(this.inputs?.pull_request?.number)
            ?? parsePositiveSafeInteger(this.inputs?.review?.pull_request?.number)
            ?? uniquePullRequestNumber(this.inputs?.check_suite?.pull_requests)
            ?? uniquePullRequestNumber(this.inputs?.workflow_run?.pull_requests)
            ?? -1;
    }

    get url(): string {
        return this.inputs?.pull_request?.html_url ?? '';
    }

    get body(): string {
        return this.inputs?.pull_request?.body ?? '';
    }

    get head(): string {
        return this.inputs?.pull_request?.head?.ref
            ?? this.inputs?.check_suite?.head_branch
            ?? this.inputs?.workflow_run?.head_branch
            ?? '';
    }

    get base(): string {
        return this.inputs?.pull_request?.base?.ref ?? '';
    }

    get isMerged(): boolean {
        return this.inputs?.pull_request?.merged ?? false;
    }

    get opened(): boolean {
        return ['opened', 'reopened'].includes(this.inputs?.action ?? '');
    }

    get isOpened(): boolean {
        return this.inputs?.eventName === 'pull_request'
            && this.inputs?.pull_request?.state === 'open'
            && this.opened;
    }

    get isClosed(): boolean {
        return this.inputs?.eventName === 'pull_request'
            && (this.inputs?.pull_request?.state === 'closed'
                || this.action === 'closed');
    }

    get isSynchronize(): boolean {
        return this.inputs?.eventName === 'pull_request'
            && this.action === 'synchronize';
    }

    get isPullRequest(): boolean {
        return [
            'pull_request',
            'pull_request_review',
            'check_suite',
            'workflow_run',
        ].includes(this.inputs?.eventName ?? '');
    }

    get isPullRequestReviewComment(): boolean {
        return this.inputs?.eventName === 'pull_request_review_comment';
    }

    /** Review comment: GitHub sends it as payload.comment for pull_request_review_comment event. */
    private get reviewCommentPayload(): EventCommentPayload | undefined {
        return this.inputs?.pull_request_review_comment ?? this.inputs?.comment;
    }

    get commentId(): number {
        return parsePositiveSafeInteger(this.reviewCommentPayload?.id) ?? -1;
    }

    get commentBody(): string {
        return this.reviewCommentPayload?.body ?? '';
    }

    get commentAuthor(): string {
        return this.reviewCommentPayload?.user?.login ?? '';
    }

    get commentUrl(): string {
        return this.reviewCommentPayload?.html_url ?? '';
    }

    /** When the comment is a reply, the id of the parent review comment (for bugbot: include parent body in intent prompt). */
    get commentInReplyToId(): number | undefined {
        const raw = this.reviewCommentPayload?.in_reply_to_id;
        return parsePositiveSafeInteger(raw);
    }

    constructor(
        desiredAssigneesCount: number,
        desiredReviewersCount: number,
        mergeTimeout: number,
        inputs: ExecutionInputs | undefined = undefined,
    ) {
        this.desiredAssigneesCount = desiredAssigneesCount;
        this.desiredReviewersCount = desiredReviewersCount;
        this.mergeTimeout = mergeTimeout;
        this.inputs = inputs;
    }
}

function uniquePullRequestNumber(
    pullRequests: ReadonlyArray<{ number?: number }> | undefined,
): number | undefined {
    return pullRequests?.length === 1
        ? parsePositiveSafeInteger(pullRequests[0]?.number)
        : undefined;
}
