import { isAgentConfigurationReady } from '../../../../../data/model/agent';
import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { FixerQueryPort } from '../../../../ports/agent_fixer_ports';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
import { logDebugInfo, logError, logInfo } from '../../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../../utils/task_emoji';
import {
    isExistingFindingFullyResolved,
    type BugbotContext,
} from './types';
import { buildBugbotFixPrompt } from './build_bugbot_fix_prompt';
import { loadBugbotContext } from './load_bugbot_context_use_case';
import {
    isSensitiveWorkspacePath,
    listWorkspacePaths,
    selectWorkspacePathsToCommit,
} from './workspace_changes';

export interface BugbotAutofixParam {
    execution: Execution;
    targetFindingIds: string[];
    userComment: string;
    /** If provided (e.g. from intent step), reuse to avoid reloading. */
    context?: BugbotContext;
    branchOverride?: string;
}

export interface BugbotAutofixWorkflowDependencies {
    aiRepository: FixerQueryPort;
    contextPorts: BugbotContextPorts;
    gitCommitPort: GitCommitPort;
}

const TASK_ID = 'BugbotAutofixUseCase';

/** Coordinates preflight, agent execution and postflight workspace safety. */
export async function runBugbotAutofixWorkflow(
    param: BugbotAutofixParam,
    dependencies: BugbotAutofixWorkflowDependencies,
): Promise<Result[]> {
    const { execution, targetFindingIds, userComment, context: providedContext, branchOverride } = param;
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);

    if (targetFindingIds.length === 0) {
        logDebugInfo('No target finding ids; skipping autofix.');
        return [];
    }
    if (!isAgentConfigurationReady(execution.ai?.getAgentConfiguration('fixer'))) {
        logDebugInfo('Agent not configured; skipping autofix.');
        return [];
    }

    try {
        const context = providedContext ?? await loadBugbotContext(
            execution,
            branchOverride ? { branchOverride } : undefined,
            dependencies.contextPorts,
        );
        const workspacePathsBefore = await inspectWorkspace(
            dependencies.gitCommitPort,
            'before',
        );
        if (workspacePathsBefore.length > 0) {
            logError(`Bugbot autofix refused because workspace is not clean: ${workspacePathsBefore.join(', ')}`);
            return [failure(TASK_ID, 'Bugbot autofix refused: workspace is not clean before agent execution.')];
        }

        const idsToFix = selectUnresolvedFindingIds(context, targetFindingIds);
        if (idsToFix.length === 0) {
            logDebugInfo('No valid unresolved target findings; skipping autofix.');
            return [];
        }

        const verifyCommands = execution.ai.getBugbotFixVerifyCommands?.() ?? [];
        const prompt = buildBugbotFixPrompt(
            execution,
            context,
            idsToFix,
            userComment,
            verifyCommands,
        );
        logDebugInfo(
            `BugbotAutofix: prompt length=${prompt.length}, target finding ids=${idsToFix.length}, verifyCommands=${verifyCommands.length}.`,
        );
        logInfo('Running configured build agent to fix selected findings (changes applied in workspace).');
        const response = await dependencies.aiRepository.fix({
            configuration: execution.ai?.getAgentConfiguration('fixer'),
            prompt,
        });
        logDebugInfo(
            `BugbotAutofix: build agent response length=${response?.text?.length ?? 0}. Full response:\n${response?.text ?? '(none)'}`,
        );
        if (!response?.text) {
            logError('Bugbot autofix: no response from configured build agent.');
            return [failure(TASK_ID, 'Configured build agent returned no response.')];
        }

        const workspacePathsAfter = await inspectWorkspace(
            dependencies.gitCommitPort,
            'after',
        );
        const unsafeWorkspacePaths = workspacePathsAfter.filter(isSensitiveWorkspacePath);
        if (unsafeWorkspacePaths.length > 0) {
            logError(`Bugbot autofix refused sensitive workspace paths: ${unsafeWorkspacePaths.join(', ')}`);
            return [
                failure(
                    TASK_ID,
                    `Bugbot autofix refused because sensitive files were modified: ${unsafeWorkspacePaths.join(', ')}`,
                ),
            ];
        }

        const workspacePaths = selectWorkspacePathsToCommit(
            workspacePathsBefore,
            workspacePathsAfter,
        );
        if (workspacePaths.length === 0) {
            logError('Bugbot autofix produced no safe workspace paths to commit.');
            return [failure(TASK_ID, 'Bugbot autofix produced no safe workspace paths to commit.')];
        }

        return [
            new Result({
                id: TASK_ID,
                success: true,
                executed: true,
                steps: [
                    `Bugbot autofix completed. The configured agent applied changes for findings: ${idsToFix.join(', ')}. Run verify commands and commit/push.`,
                ],
                payload: { targetFindingIds: idsToFix, context, workspacePaths },
            }),
        ];
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`Bugbot autofix failed: ${message}`);
        return [failure(TASK_ID, `Bugbot autofix failed: ${message}`)];
    }
}

function selectUnresolvedFindingIds(context: BugbotContext, targetFindingIds: string[]): string[] {
    const validIds = new Set(
        Object.entries(context.existingByFindingId)
            .filter(([, info]) => !isExistingFindingFullyResolved(info))
            .map(([id]) => id),
    );
    return targetFindingIds.filter((id) => validIds.has(id));
}

async function inspectWorkspace(gitCommitPort: GitCommitPort, phase: string): Promise<string[]> {
    try {
        return await listWorkspacePaths(gitCommitPort);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to inspect workspace ${phase} autofix: ${message}`);
    }
}

function failure(taskId: string, message: string): Result {
    return new Result({
        id: taskId,
        success: false,
        executed: true,
        errors: [message],
    });
}
