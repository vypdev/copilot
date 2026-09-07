import type { GitCommitPort } from '../../../ports/git_ports';
export declare const MAX_AUTOMATED_CHANGED_PATHS = 100;
export interface WorkspaceMutationPreflight {
    workspacePathsBefore: string[];
    branchCheckedOut: boolean;
}
/** Establishes a clean and deterministic repository boundary before an agent may mutate files. */
export declare function prepareWorkspaceMutation(gitCommitPort: GitCommitPort, options: {
    operation: string;
    branch?: string;
    token?: string;
}): Promise<WorkspaceMutationPreflight>;
/** Restricts an automated mutation to new, non-sensitive and bounded repository paths. */
export declare function finalizeWorkspaceMutation(gitCommitPort: GitCommitPort, before: readonly string[], operation: string): Promise<{
    workspacePaths: string[];
}>;
