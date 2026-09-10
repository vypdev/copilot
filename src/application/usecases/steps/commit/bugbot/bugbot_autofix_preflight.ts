import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { BugbotContext } from './types';
import { isExistingFindingFullyResolved } from './types';
import { buildBugbotFixPrompt } from './build_bugbot_fix_prompt';
import { loadBugbotContext } from './load_bugbot_context_use_case';
import { logDebugInfo, logError } from '../../../../ports/logging_ports';
import { prepareWorkspaceMutation } from '../workspace_mutation_guard';

export type BugbotAutofixPreflight = {
    context: BugbotContext;
    workspacePathsBefore: string[];
    idsToFix: string[];
    prompt: string;
    branchCheckedOut: boolean;
};

export async function prepareBugbotAutofix(
    execution: Execution,
    targetFindingIds: string[],
    userComment: string,
    providedContext: BugbotContext | undefined,
    branchOverride: string | undefined,
    contextPorts: BugbotContextPorts,
    gitCommitPort: GitCommitPort,
): Promise<BugbotAutofixPreflight | Result[]> {
    let mutation;
    try {
        mutation = await prepareWorkspaceMutation(gitCommitPort, {
            operation: 'Bugbot autofix',
            branch: branchOverride,
            token: execution.tokens.token,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(message);
        return [failure(message)];
    }
    const context = providedContext ?? await loadBugbotContext(execution, branchOverride ? { branchOverride } : undefined, contextPorts);
    const idsToFix = selectUnresolvedFindingIds(context, targetFindingIds);
    if (idsToFix.length === 0) {
        logDebugInfo('No valid unresolved target findings; skipping autofix.');
        return [];
    }
    const verifyCommands = execution.ai.getBugbotFixVerifyCommands();
    const prompt = buildBugbotFixPrompt(execution, context, idsToFix, userComment, verifyCommands);
    logDebugInfo(`BugbotAutofix: prompt length=${prompt.length}, target finding ids=${idsToFix.length}, verifyCommands=${verifyCommands.length}.`);
    return {
        context,
        workspacePathsBefore: mutation.workspacePathsBefore,
        idsToFix,
        prompt,
        branchCheckedOut: mutation.branchCheckedOut,
    };
}

function selectUnresolvedFindingIds(context: BugbotContext, targetFindingIds: string[]): string[] {
    const validIds = new Set(Object.entries(context.existingByFindingId)
        .filter(([, info]) => !isExistingFindingFullyResolved(info))
        .map(([id]) => id));
    return targetFindingIds.filter(id => validIds.has(id));
}

function failure(message: string): Result {
    return new Result({ id: 'BugbotAutofixUseCase', success: false, executed: true, errors: [message] });
}
