import { Result } from '../../../../../data/model/result';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { BugbotContext } from './types';
import { logDebugInfo, logError } from '../../../../ports/logging_ports';
import { finalizeWorkspaceMutation } from '../workspace_mutation_guard';
import { ApplicationError, toApplicationError } from '../../../../errors/application_error';

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
        return [failure(new ApplicationError('agent.failed', 'Configured build agent returned no response.'))];
    }
    let workspacePaths: string[];
    try {
        ({ workspacePaths } = await finalizeWorkspaceMutation(
            gitCommitPort,
            workspacePathsBefore,
            'Bugbot autofix',
        ));
    } catch (error) {
        const semanticError = toApplicationError(error, 'workflow.failed', 'Bugbot autofix postflight failed.');
        logError(semanticError);
        return [failure(semanticError)];
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

function failure(semanticError: ApplicationError): Result {
    return new Result({ id: 'BugbotAutofixUseCase', success: false, executed: true, errors: [semanticError] });
}
