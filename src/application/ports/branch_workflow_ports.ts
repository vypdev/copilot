export interface BranchWorkflowPort {
    executeWorkflow(owner: string, repository: string, branch: string, workflow: string, inputs: Record<string, unknown>, token: string): Promise<void>;
}

/** Repository-credential-bound workflow dispatch authority. */
export interface BoundBranchWorkflowPort {
    executeWorkflow(branch: string, workflow: string, inputs: Readonly<Record<string, unknown>>): Promise<void>;
}
