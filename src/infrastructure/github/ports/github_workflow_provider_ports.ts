export interface GithubWorkflowRunsParameters {
    owner: string;
    repo: string;
    per_page?: number;
    workflow_id: string;
    status?: string;
}

export interface GithubWorkflowRunsResponse {
    data: { workflow_runs: GithubWorkflowRun[] } | GithubWorkflowRun[];
}

export interface GithubWorkflowRunsClient {
    rest: {
        actions: {
            listWorkflowRuns(parameters: GithubWorkflowRunsParameters): Promise<GithubWorkflowRunsResponse>;
        };
    };
    paginate: {
        iterator(
            method: GithubWorkflowRunsMethod,
            parameters: GithubWorkflowRunsParameters,
        ): AsyncIterable<GithubWorkflowRunsResponse>;
    };
}

export type GithubWorkflowRunsMethod = (
    parameters: GithubWorkflowRunsParameters,
) => Promise<GithubWorkflowRunsResponse>;

export interface GithubWorkflowDispatchClient {
    rest: {
        actions: {
            createWorkflowDispatch(parameters: {
                owner: string;
                repo: string;
                workflow_id: string;
                ref: string;
                inputs: Record<string, unknown>;
            }): Promise<unknown>;
        };
    };
}

export interface GithubWorkflowRun {
    id: number;
    status: string | null;
    name?: string | null;
}
