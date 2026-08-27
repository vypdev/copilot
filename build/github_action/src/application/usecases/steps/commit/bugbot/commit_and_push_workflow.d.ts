import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { AuthenticatedUserPort } from '../../../../../application/ports/authenticated_user_ports';
import type { Execution } from '../../../../../data/model/execution';
export interface CommitAndPushWorkflowResult {
    success: boolean;
    committed: boolean;
    error?: string;
}
export interface CommitAndPushWorkflowOptions {
    branch: string;
    commitMessage: string;
    branchOverride?: boolean;
    workspacePaths?: string[];
    noChangesMessage: string;
}
export declare function runCommitAndPushWorkflow(execution: Execution, options: CommitAndPushWorkflowOptions, authenticatedUserPort: AuthenticatedUserPort, gitCommitPort: GitCommitPort): Promise<CommitAndPushWorkflowResult>;
