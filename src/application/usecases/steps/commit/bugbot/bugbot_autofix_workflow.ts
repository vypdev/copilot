import { isAgentConfigurationReady } from '../../../../../data/model/agent';
import { Result } from '../../../../../data/model/result';
import { logDebugInfo, logError, logInfo } from '../../../../ports/logging_ports';
import { getTaskEmoji } from '../../../../../utils/task_emoji';
import { finalizeBugbotAutofix } from './bugbot_autofix_postflight';
import { prepareBugbotAutofix } from './bugbot_autofix_preflight';
import type { BugbotAutofixParam, BugbotAutofixWorkflowDependencies } from './bugbot_autofix_contracts';

export type { BugbotAutofixParam, BugbotAutofixWorkflowDependencies } from './bugbot_autofix_contracts';

const TASK_ID = 'BugbotAutofixUseCase';

/** Coordinates preflight, agent execution and postflight workspace safety. */
export async function runBugbotAutofixWorkflow(
    param: BugbotAutofixParam,
    dependencies: BugbotAutofixWorkflowDependencies,
): Promise<Result[]> {
    logInfo(`${getTaskEmoji(TASK_ID)} Executing ${TASK_ID}.`);

    if (param.targetFindingIds.length === 0) {
        logDebugInfo('No target finding ids; skipping autofix.');
        return [];
    }
    if (!isAgentConfigurationReady(param.execution.ai?.getAgentConfiguration('fixer'))) {
        logDebugInfo('Agent not configured; skipping autofix.');
        return [];
    }

    try {
        const preflight = await prepareBugbotAutofix(
            param.execution,
            param.targetFindingIds,
            param.userComment,
            param.context,
            param.branchOverride,
            dependencies.contextPorts,
            dependencies.gitCommitPort,
        );
        if (Array.isArray(preflight)) return preflight;

        logInfo('Running configured build agent to fix selected findings (changes applied in workspace).');
        const response = await dependencies.aiRepository.fix({
            configuration: param.execution.ai?.getAgentConfiguration('fixer'),
            prompt: preflight.prompt,
        });
        logDebugInfo(
            `BugbotAutofix: build agent response length=${response?.text?.length ?? 0}. Full response:\n${response?.text ?? '(none)'}`,
        );

        return await finalizeBugbotAutofix(
            param.execution,
            preflight.context,
            preflight.idsToFix,
            preflight.workspacePathsBefore,
            response?.text,
            dependencies.gitCommitPort,
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`Bugbot autofix failed: ${message}`);
        return [newResultFailure(`Bugbot autofix failed: ${message}`)];
    }
}

function newResultFailure(message: string): Result {
    return new Result({ id: TASK_ID, success: false, executed: true, errors: [message] });
}
