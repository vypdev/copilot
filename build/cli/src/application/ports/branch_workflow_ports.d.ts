export interface BranchWorkflowPort {
    executeWorkflow(owner: string, repository: string, branch: string, workflow: string, inputs: Record<string, unknown>, token: string): Promise<void>;
}
