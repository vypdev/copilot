export interface EventUserPayload {
    login?: string;
}

export interface EventCommentPayload {
    id?: number;
    body?: string | null;
    html_url?: string;
    user?: EventUserPayload;
    in_reply_to_id?: number;
}

export interface EventIssuePayload {
    title?: string;
    number?: number;
    html_url?: string;
    body?: string | null;
    user?: EventUserPayload;
}

export interface EventLabelPayload {
    name?: string;
}

export interface EventPullRequestPayload {
    node_id?: string;
    title?: string;
    number?: number;
    html_url?: string;
    body?: string | null;
    user?: EventUserPayload;
    head?: { ref?: string };
    base?: { ref?: string };
    merged?: boolean;
    state?: string;
}

export interface EventCommitPayload {
    id?: string;
    message?: string;
    author?: {
        name?: string;
        username?: string;
    };
}

export interface ExecutionInputs {
    eventName?: string;
    actor?: string;
    action?: string;
    ref?: string;
    repo?: { owner?: string; repo?: string };
    issue?: EventIssuePayload;
    label?: EventLabelPayload;
    pull_request?: EventPullRequestPayload;
    comment?: EventCommentPayload;
    pull_request_review_comment?: EventCommentPayload;
    changes?: Record<string, unknown>;
    commits?: { ref?: string } | EventCommitPayload[];
    [key: string]: unknown;
}
