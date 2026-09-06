export interface GithubCredentialHealthClient {
    rest: {
        actions: {
            createWorkflowDispatch(parameters: Record<string, unknown>): Promise<unknown>;
            listWorkflowRuns(parameters: Record<string, unknown>): Promise<{
                data: {
                    workflow_runs: GithubWorkflowRun[];
                };
            }>;
            getWorkflowRun(parameters: Record<string, unknown>): Promise<{
                data: GithubWorkflowRun;
            }>;
            listJobsForWorkflowRun(parameters: Record<string, unknown>): Promise<{
                data: {
                    jobs: GithubWorkflowJob[];
                };
            }>;
            getWorkflow(parameters: Record<string, unknown>): Promise<unknown>;
        };
    };
    repos: {
        get(parameters: Record<string, unknown>): Promise<{
            data: {
                default_branch?: string;
            };
        }>;
        getContent(parameters: Record<string, unknown>): Promise<{
            data: {
                sha?: string;
            };
        }>;
        createOrUpdateFileContents(parameters: Record<string, unknown>): Promise<{
            data?: {
                content?: {
                    sha?: string;
                };
            };
        }>;
        deleteFile(parameters: Record<string, unknown>): Promise<unknown>;
    };
}
export interface GithubWorkflowRun {
    id: number;
    status?: string | null;
    conclusion?: string | null;
    created_at?: string;
}
export interface GithubWorkflowJob {
    name: string;
    status?: string | null;
    conclusion?: string | null;
}
