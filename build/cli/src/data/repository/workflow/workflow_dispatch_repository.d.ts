import type { BranchWorkflowPort } from '../../../application/ports/branch_workflow_ports';
import type { GithubWorkflowDispatchClient } from '../../../infrastructure/github/ports/github_workflow_provider_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
export declare class WorkflowDispatchRepository implements BranchWorkflowPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubWorkflowDispatchClient>);
    executeWorkflow(owner: string, repository: string, branch: string, workflow: string, inputs: Record<string, unknown>, token: string): Promise<void>;
}
