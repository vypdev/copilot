import type { PreviousWorkflowRunsQuery, PreviousWorkflowRunsQueryPort } from '../../../application/ports/workflow_run_ports';
import type { GithubWorkflowRunsClient } from '../../../infrastructure/github/ports/github_workflow_provider_ports';
export declare class ActivePreviousWorkflowRunsRepository implements PreviousWorkflowRunsQueryPort {
    private readonly client;
    constructor(client: GithubWorkflowRunsClient);
    countActivePreviousRuns(query: PreviousWorkflowRunsQuery): Promise<number>;
    private isActivePreviousRun;
}
