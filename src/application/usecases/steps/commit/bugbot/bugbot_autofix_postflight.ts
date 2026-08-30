import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { BugbotContext } from './types';
import { isSensitiveWorkspacePath, listWorkspacePaths, selectWorkspacePathsToCommit } from './workspace_changes';
import { logDebugInfo, logError } from '../../../../ports/logging_ports';

export async function finalizeBugbotAutofix(
    execution: Execution,
    context: BugbotContext,
    idsToFix: string[],
    workspacePathsBefore: string[],
    responseText: string | undefined,
    gitCommitPort: GitCommitPort,
): Promise<Result[]> {
    if (!responseText) {
        logError('Bugbot autofix: no response from configured build agent.');
        return [failure('Configured build agent returned no response.')];
    }
    const workspacePathsAfter = await inspectWorkspace(gitCommitPort, 'after');
    const unsafePaths = workspacePathsAfter.filter(isSensitiveWorkspacePath);
    if (unsafePaths.length > 0) {
        logError(`Bugbot autofix refused sensitive workspace paths: ${unsafePaths.join(', ')}`);
        return [failure(`Bugbot autofix refused because sensitive files were modified: ${unsafePaths.join(', ')}`)];
    }
    const workspacePaths = selectWorkspacePathsToCommit(workspacePathsBefore, workspacePathsAfter);
    if (workspacePaths.length === 0) {
        logError('Bugbot autofix produced no safe workspace paths to commit.');
        return [failure('Bugbot autofix produced no safe workspace paths to commit.')];
    }
    logDebugInfo(`BugbotAutofix: response length=${responseText.length}; safe paths=${workspacePaths.length}.`);
    return [new Result({
        id: 'BugbotAutofixUseCase',
        success: true,
        executed: true,
        steps: [`Bugbot autofix completed. The configured agent applied changes for findings: ${idsToFix.join(', ')}. Run verify commands and commit/push.`],
        payload: { targetFindingIds: idsToFix, context, workspacePaths },
    })];
}

async function inspectWorkspace(gitCommitPort: GitCommitPort, phase: string): Promise<string[]> {
    try {
        return await listWorkspacePaths(gitCommitPort);
    } catch (error) {
        throw new Error(`Unable to inspect workspace ${phase} autofix: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function failure(message: string): Result {
    return new Result({ id: 'BugbotAutofixUseCase', success: false, executed: true, errors: [message] });
}
