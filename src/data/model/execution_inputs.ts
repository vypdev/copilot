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
    head?: { ref?: string; sha?: string };
    base?: { ref?: string };
    merged?: boolean;
    state?: string;
}

export interface EventPullRequestReferencePayload {
    number?: number;
}

export interface EventReviewPayload {
    state?: string;
    pull_request?: EventPullRequestReferencePayload;
}

export interface EventCheckSuitePayload {
    status?: string;
    conclusion?: string | null;
    head_branch?: string;
    head_sha?: string;
    pull_requests?: EventPullRequestReferencePayload[];
}

export interface EventWorkflowRunPayload {
    status?: string;
    conclusion?: string | null;
    head_branch?: string;
    head_sha?: string;
    pull_requests?: EventPullRequestReferencePayload[];
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
    review?: EventReviewPayload;
    check_suite?: EventCheckSuitePayload;
    workflow_run?: EventWorkflowRunPayload;
    comment?: EventCommentPayload;
    pull_request_review_comment?: EventCommentPayload;
    changes?: Record<string, unknown>;
    commits?: { ref?: string } | EventCommitPayload[];
    [key: string]: unknown;
}
