import type { GitCommitPort } from '../../../ports/git_ports';
import { ApplicationError } from '../../../errors/application_error';
import { checkoutBranch } from './git_branch_checkout';
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
            'agent.policy-rejected',
            `${options.operation} refused: workspace is not clean before agent execution.`,
        );
    }

    let branchCheckedOut = false;
    if (options.branch?.trim()) {
        branchCheckedOut = await checkoutBranch(options.branch, {
            execute: gitCommitPort.execute.bind(gitCommitPort),
            fetch: (branch) => gitCommitPort.fetch(branch, options.token),
        });
        if (!branchCheckedOut) {
            throw new ApplicationError(
                'provider.unavailable',
                `${options.operation} refused: failed to checkout target branch ${options.branch}.`,
            );
        }
        const afterCheckout = await inspectWorkspace(gitCommitPort, `after ${options.operation} branch checkout`);
        if (afterCheckout.length > 0) {
            throw new ApplicationError(
                'agent.policy-rejected',
                `${options.operation} refused: branch checkout produced a dirty workspace.`,
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
            'agent.policy-rejected',
            `${operation} refused because sensitive files were modified: ${unsafePaths.join(', ')}`,
        );
    }

    const workspacePaths = selectWorkspacePathsToCommit([...before], workspacePathsAfter);
    if (workspacePaths.length === 0) {
        throw new ApplicationError('agent.policy-rejected', `${operation} produced no safe workspace paths to commit.`);
    }
    if (workspacePaths.length > MAX_AUTOMATED_CHANGED_PATHS) {
        throw new ApplicationError(
            'agent.policy-rejected',
            `${operation} refused because it changed ${workspacePaths.length} paths; maximum is ${MAX_AUTOMATED_CHANGED_PATHS}.`,
        );
    }
    return { workspacePaths };
}

async function inspectWorkspace(gitCommitPort: GitCommitPort, phase: string): Promise<string[]> {
    try {
        return await listWorkspacePaths(gitCommitPort);
    } catch (error) {
        throw new ApplicationError('provider.unavailable', `Unable to inspect workspace ${phase}.`, {
            cause: error,
        });
    }
}
