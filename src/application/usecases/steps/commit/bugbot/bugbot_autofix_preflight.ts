import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import { ApplicationError } from '../../../../errors/application_error';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { BugbotContext } from './types';
import { isExistingFindingFullyResolved } from './types';
import { buildBugbotFixPrompt } from './build_bugbot_fix_prompt';
import { loadBugbotContext } from './load_bugbot_context_use_case';
import { listWorkspacePaths } from './workspace_changes';
import { logDebugInfo, logError } from '../../../../ports/logging_ports';
import { checkoutBranch } from './git_branch_checkout';

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
    const workspacePathsBefore = await inspectWorkspace(gitCommitPort, 'before');
    if (workspacePathsBefore.length > 0) {
        logError(`Bugbot autofix refused because workspace is not clean: ${workspacePathsBefore.join(', ')}`);
        return [failure('Bugbot autofix refused: workspace is not clean before agent execution.')];
    }
    const branchCheckedOut = Boolean(branchOverride);
    if (branchOverride && !(await checkoutBranch(branchOverride, gitCommitPort))) {
        return [failure(`Bugbot autofix refused: failed to checkout target branch ${branchOverride}.`)];
    }
    const context = providedContext ?? await loadBugbotContext(execution, branchOverride ? { branchOverride } : undefined, contextPorts);
    const idsToFix = selectUnresolvedFindingIds(context, targetFindingIds);
    if (idsToFix.length === 0) {
        logDebugInfo('No valid unresolved target findings; skipping autofix.');
        return [];
    }
    const verifyCommands = execution.ai?.getBugbotFixVerifyCommands?.() ?? [];
    const prompt = buildBugbotFixPrompt(execution, context, idsToFix, userComment, verifyCommands);
    logDebugInfo(`BugbotAutofix: prompt length=${prompt.length}, target finding ids=${idsToFix.length}, verifyCommands=${verifyCommands.length}.`);
    return { context, workspacePathsBefore, idsToFix, prompt, branchCheckedOut };
}

function selectUnresolvedFindingIds(context: BugbotContext, targetFindingIds: string[]): string[] {
    const validIds = new Set(Object.entries(context.existingByFindingId)
        .filter(([, info]) => !isExistingFindingFullyResolved(info))
        .map(([id]) => id));
    return targetFindingIds.filter(id => validIds.has(id));
}

async function inspectWorkspace(gitCommitPort: GitCommitPort, phase: string): Promise<string[]> {
    try {
        return await listWorkspacePaths(gitCommitPort);
    } catch (error) {
        throw new ApplicationError(
            `Unable to inspect workspace ${phase} autofix: ${error instanceof Error ? error.message : String(error)}`,
            'provider',
            { cause: error, retryable: true },
        );
    }
}

function failure(message: string): Result {
    return new Result({ id: 'BugbotAutofixUseCase', success: false, executed: true, errors: [message] });
}
