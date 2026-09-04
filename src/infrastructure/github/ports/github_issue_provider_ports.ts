export interface GithubIssueLifecycleClient {
    rest: {
        issues: {
            get(parameters: Record<string, unknown>): Promise<{ data: { state: "open" | "closed" } }>;
            update(parameters: Record<string, unknown>): Promise<unknown>;
        };
    };
}

export interface GithubIssueInactivityClient {
    paginate: {
        iterator(
            method: (parameters: Record<string, unknown>) => Promise<{ data: GithubIssueActivity[] }>,
            parameters: Record<string, unknown>,
        ): AsyncIterable<{ data: GithubIssueActivity[] }>;
    };
    rest: {
        issues: {
            listForRepo(parameters: Record<string, unknown>): Promise<{ data: GithubIssueActivity[] }>;
            get(parameters: Record<string, unknown>): Promise<{ data: GithubIssueActivity }>;
        };
    };
}

export interface GithubIssueActivity {
    number: number;
    updated_at?: string | null;
    state?: 'open' | 'closed' | string;
    pull_request?: unknown;
    labels?: Array<{ name?: string } | string>;
}

export interface GithubIssueContentClient {
    paginate: {
        iterator(
            method: (parameters: Record<string, unknown>) => Promise<{ data: GithubIssueComment[] }>,
            parameters: Record<string, unknown>,
        ): AsyncIterable<{ data: GithubIssueComment[] }>;
    };
    rest: {
        issues: {
            get(parameters: Record<string, unknown>): Promise<{ data: { body?: string | null } }>;
            update(parameters: Record<string, unknown>): Promise<unknown>;
            createComment(parameters: Record<string, unknown>): Promise<unknown>;
            updateComment(parameters: Record<string, unknown>): Promise<unknown>;
            listComments(parameters: Record<string, unknown>): Promise<{ data: GithubIssueComment[] }>;
        };
    };
}

export interface GithubIssueComment {
    id: number;
    body?: string | null;
    user?: { login?: string };
}

export interface GithubIssueTitleClient {
    rest: {
        issues: {
            update(parameters: Record<string, unknown>): Promise<unknown>;
        };
    };
}

export interface GithubIssueMetadataClient {
    rest: {
        issues: {
            get(parameters: Record<string, unknown>): Promise<{ data: { title?: string; milestone?: { id: number; title: string; description?: string | null } | null; pull_request?: unknown } }>;
        };
        pulls: {
            get(parameters: Record<string, unknown>): Promise<{ data: { head: { ref: string } } }>;
        };
    };
}

export interface GithubIssueLabelsClient {
    rest: {
        issues: {
            listLabelsOnIssue(parameters: Record<string, unknown>): Promise<{ data: Array<{ name: string }> }>;
            setLabels(parameters: Record<string, unknown>): Promise<unknown>;
        };
    };
}

export interface GithubIssueAssignmentClient {
    rest: {
        issues: {
            get(parameters: Record<string, unknown>): Promise<{ data: { assignees?: Array<{ login: string }> | null } }>;
            addAssignees(parameters: Record<string, unknown>): Promise<{ data: { assignees?: Array<{ login: string }> | null } }>;
        };
    };
}
