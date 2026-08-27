import type { BranchWorkflowPort } from '../../../application/ports/branch_workflow_ports';
import type { GithubWorkflowDispatchClient } from '../../../infrastructure/github/ports/github_workflow_provider_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';

export class WorkflowDispatchRepository implements BranchWorkflowPort {
    constructor(private readonly githubClient: GithubClientPort<GithubWorkflowDispatchClient>) {}

    async executeWorkflow(
        owner: string,
        repository: string,
        branch: string,
        workflow: string,
        inputs: Record<string, unknown>,
        token: string,
    ): Promise<void> {
        const client = this.githubClient.getClient(token);
        await client.rest.actions.createWorkflowDispatch({
            owner,
            repo: repository,
            workflow_id: workflow,
            ref: branch,
            inputs,
        });
    }
}
