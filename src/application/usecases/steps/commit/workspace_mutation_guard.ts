import type { GitCommitPort } from '../../../ports/git_ports';
import { ApplicationError } from '../../../errors/application_error';
import { checkoutBranch } from './bugbot/git_branch_checkout';
import {
    isSensitiveWorkspacePath,
    listWorkspacePaths,
    selectWorkspacePathsToCommit,
} from './bugbot/workspace_changes';

export const MAX_AUTOMATED_CHANGED_PATHS = 100;

export interface WorkspaceMutationPreflight {
    workspacePathsBefore: string[];
    branchCheckedOut: boolean;
}

/** Establishes a clean and deterministic repository boundary before an agent may mutate files. */
export async function prepareWorkspaceMutation(
    gitCommitPort: GitCommitPort,
    options: { operation: string; branch?: string; token?: string },
): Promise<WorkspaceMutationPreflight> {
    const workspacePathsBefore = await inspectWorkspace(gitCommitPort, `before ${options.operation}`);
    if (workspacePathsBefore.length > 0) {
        throw new ApplicationError(
            `${options.operation} refused: workspace is not clean before agent execution.`,
            'validation',
        );
    }

    let branchCheckedOut = false;
    if (options.branch?.trim()) {
        branchCheckedOut = await checkoutBranch(options.branch, gitCommitPort, options.token);
        if (!branchCheckedOut) {
            throw new ApplicationError(
                `${options.operation} refused: failed to checkout target branch ${options.branch}.`,
                'provider',
            );
        }
        const afterCheckout = await inspectWorkspace(gitCommitPort, `after ${options.operation} branch checkout`);
        if (afterCheckout.length > 0) {
            throw new ApplicationError(
                `${options.operation} refused: branch checkout produced a dirty workspace.`,
                'validation',
            );
        }
    }

    return { workspacePathsBefore, branchCheckedOut };
}

/** Restricts an automated mutation to new, non-sensitive and bounded repository paths. */
export async function finalizeWorkspaceMutation(
    gitCommitPort: GitCommitPort,
    before: readonly string[],
    operation: string,
): Promise<{ workspacePaths: string[] }> {
    const workspacePathsAfter = await inspectWorkspace(gitCommitPort, `after ${operation}`);
    const unsafePaths = workspacePathsAfter.filter(isSensitiveWorkspacePath);
    if (unsafePaths.length > 0) {
        throw new ApplicationError(
            `${operation} refused because sensitive files were modified: ${unsafePaths.join(', ')}`,
            'validation',
        );
    }

    const workspacePaths = selectWorkspacePathsToCommit([...before], workspacePathsAfter);
    if (workspacePaths.length === 0) {
        throw new ApplicationError(`${operation} produced no safe workspace paths to commit.`, 'validation');
    }
    if (workspacePaths.length > MAX_AUTOMATED_CHANGED_PATHS) {
        throw new ApplicationError(
            `${operation} refused because it changed ${workspacePaths.length} paths; maximum is ${MAX_AUTOMATED_CHANGED_PATHS}.`,
            'validation',
        );
    }
    return { workspacePaths };
}

async function inspectWorkspace(gitCommitPort: GitCommitPort, phase: string): Promise<string[]> {
    try {
        return await listWorkspacePaths(gitCommitPort);
    } catch (error) {
        throw new ApplicationError(`Unable to inspect workspace ${phase}.`, 'provider', {
            cause: error,
            retryable: true,
        });
    }
}
