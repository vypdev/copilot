import { Result } from '../../../../../data/model/result';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { BugbotContext } from './types';
import { logDebugInfo, logError } from '../../../../ports/logging_ports';
import { finalizeWorkspaceMutation } from '../workspace_mutation_guard';

export async function finalizeBugbotAutofix(
    context: BugbotContext,
    idsToFix: string[],
    workspacePathsBefore: string[],
    branchCheckedOut: boolean,
    responseText: string | undefined,
    gitCommitPort: GitCommitPort,
): Promise<Result[]> {
    if (!responseText) {
        logError('Bugbot autofix: no response from configured build agent.');
        return [failure('Configured build agent returned no response.')];
    }
    let workspacePaths: string[];
    try {
        ({ workspacePaths } = await finalizeWorkspaceMutation(
            gitCommitPort,
            workspacePathsBefore,
            'Bugbot autofix',
        ));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(message);
        return [failure(message)];
    }
    logDebugInfo(`BugbotAutofix: response length=${responseText.length}; safe paths=${workspacePaths.length}.`);
    return [new Result({
        id: 'BugbotAutofixUseCase',
        success: true,
        executed: true,
        steps: [`Bugbot autofix completed. The configured agent applied changes for findings: ${idsToFix.join(', ')}. Run verify commands and commit/push.`],
        payload: { targetFindingIds: idsToFix, context, workspacePaths, branchCheckedOut },
    })];
}

function failure(message: string): Result {
    return new Result({ id: 'BugbotAutofixUseCase', success: false, executed: true, errors: [message] });
}
