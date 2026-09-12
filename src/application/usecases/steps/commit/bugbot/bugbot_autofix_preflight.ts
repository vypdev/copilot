import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { BugbotContext } from './types';
import { isExistingFindingFullyResolved } from '../../../../../domain/bugbot/finding';
import { buildBugbotFixPrompt } from './build_bugbot_fix_prompt';
import { loadBugbotContext } from './load_bugbot_context_use_case';
import { projectBugbotContextRequest } from './bugbot_context_request';
import { projectBugbotContextSelectionContext } from './bugbot_review_operation_context';
import { logDebugInfo, logError } from '../../../../ports/logging_ports';
import { prepareWorkspaceMutation } from '../workspace_mutation_guard';
import { ApplicationError, toApplicationError } from '../../../../errors/application_error';

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
    const canonicalHint = providedContext?.canonicalPullRequest;
    const targetBranch = branchOverride?.trim() || canonicalHint?.headRef;
    const checkoutBranch = branchOverride?.trim()
        || (!execution.commit.branch?.trim() ? canonicalHint?.headRef : undefined);
    let context: BugbotContext;
    try {
        context = await loadBugbotContext(
            projectBugbotContextRequest(projectBugbotContextSelectionContext(execution), {
                ...(targetBranch ? { branchOverride: targetBranch } : {}),
                ...(canonicalHint ? { pullRequestNumberOverride: canonicalHint.number } : {}),
                exactHeadPullRequestRequired: true,
            }),
            contextPorts.loader.bind({
                owner: execution.owner,
                repository: execution.repo,
                token: execution.tokens.token,
            }),
        );
        if (!context.canonicalPullRequest) {
            throw new ApplicationError(
                'workflow.stale',
                'Bugbot autofix requires one verified canonical pull request.',
            );
        }
    } catch (error) {
        const semanticError = toApplicationError(error, 'workflow.failed', 'Bugbot autofix context validation failed.');
        logError(semanticError);
        return [failure(semanticError)];
    }
    const idsToFix = selectUnresolvedFindingIds(context, targetFindingIds);
    if (idsToFix.length === 0) {
        logDebugInfo('No valid unresolved target findings; skipping autofix.');
        return [];
    }
    let mutation;
    try {
        mutation = await prepareWorkspaceMutation(gitCommitPort, {
            operation: 'Bugbot autofix',
            branch: checkoutBranch,
            token: execution.tokens.token,
        });
    } catch (error) {
        const semanticError = toApplicationError(error, 'workflow.failed', 'Bugbot autofix preflight failed.');
        logError(semanticError);
        return [failure(semanticError)];
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

function failure(semanticError: ApplicationError): Result {
    return new Result({ id: 'BugbotAutofixUseCase', success: false, executed: true, errors: [semanticError] });
}
