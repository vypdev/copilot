import * as core from '@actions/core';
import * as github from '@actions/github';
import { ConfigurationHandler } from '../manager/description/configuration_handler';
import { GitCliRepository } from '../data/repository/git_cli_repository';
import { createIssueContentCompositionRoot } from '../infrastructure/composition/issue_content_composition_root';
import { createIssueNotificationRepository } from '../infrastructure/composition/issue_interaction_composition_root';
import { createProjectBoardCompositionRoot } from '../infrastructure/composition/project_board_composition_root';
import { finishGithubAction } from './github_action_completion';
import { getGithubActionInput } from './github_action_input';
import { isEnabledInput } from './input_boolean_policy';
import { buildGithubActionExecution, readGithubActionSingleAction } from './github_action_execution';
import { buildGithubActionEventInputs } from './github_event_inputs';
import { mainRun } from './common_action';
import { INPUT_KEYS } from '../application/contracts/input_keys';
import { logDebugInfo, logError, logInfo } from '../utils/logger';
import { createGithubExecutionAdmissionUseCase } from '../infrastructure/composition/github_execution_admission_composition_root';
import { createSynchronizeLifecycleStateUseCase } from '../infrastructure/composition/lifecycle_state_composition_root';
import { createCopilotEvidenceCompositionRoot } from '../infrastructure/composition/copilot_evidence_composition_root';
import { createGithubActionSummaryCompositionRoot } from '../infrastructure/composition/github_action_summary_composition_root';
import { createSynchronizeAgentActivityUseCase } from '../infrastructure/composition/agent_activity_composition_root';
import { readGithubActionAiInputs } from './github_action_ai_inputs';
import { activeAgentTasks } from '../application/policies/agent_task_activation_policy';
import { createActorAuthorizationRepository } from '../infrastructure/composition/actor_authorization_composition_root';
import { runAtApplicationErrorBoundary } from '../application/errors/application_error_context';
import { toApplicationError } from '../application/errors/application_error';
import { renderApplicationErrorText } from '../application/policies/application_error_presentation_policy';

export async function runGitHubAction(): Promise<void> {
    const eventInputs = buildGithubActionEventInputs({
        payload: github.context.payload as Record<string, unknown>,
        eventName: github.context.eventName,
        actor: github.context.actor,
        repo: github.context.repo,
    });
    logInfo('GitHub Action: runGitHubAction started.');
    const debug = isEnabledInput(getGithubActionInput(INPUT_KEYS.DEBUG));
    if (debug) {
        logInfo('Debug mode is enabled. Full logs will be included in the report.');
    }

    const token = getGithubActionInput(INPUT_KEYS.TOKEN, { required: true });
    const singleAction = readGithubActionSingleAction(getGithubActionInput);
    const admission = await createGithubExecutionAdmissionUseCase().invoke({
        actor: eventInputs.actor,
        token,
        isSingleAction: singleAction.enabledSingleAction,
        validSingleAction: singleAction.validSingleAction,
    });
    if (admission.decision === 'discard') {
        logInfo('GitHub Action: event actor matches the PAT user. Skipping normal pipeline before queue and mutation work.');
        return;
    }

    const aiInputs = readGithubActionAiInputs(getGithubActionInput);
    const requestedActiveAgentTasks = activeAgentTasks(
        eventInputs,
        singleAction,
        admission.tokenUser,
        aiInputs.pullRequestDescriptionMode !== 'disabled',
    );
    const agentRuntimeAuthorized = !aiInputs.membersOnly
        || requestedActiveAgentTasks.length === 0
        || await createActorAuthorizationRepository().isActorAllowedToModifyFiles(
            eventInputs.repo.owner,
            eventInputs.repo.repo,
            eventInputs.actor,
            token,
        );
    if (!agentRuntimeAuthorized) {
        logInfo('Skipping agent runtime preparation because ai-members-only is enabled and the actor is not authorized.');
    }

    const projectBoard = createProjectBoardCompositionRoot();

    const execution = await buildGithubActionExecution({
        debug,
        eventInputs,
        getInput: getGithubActionInput,
        projectQuery: projectBoard.query,
        token,
        tokenUser: admission.tokenUser,
        singleAction,
        aiInputs,
        activeAgentTasks: agentRuntimeAuthorized ? requestedActiveAgentTasks : [],
        agentRuntimeAuthorized,
    });
    logDebugInfo(
        `Execution built. Event will be resolved in mainRun. Single action: ${execution.singleAction.currentSingleAction ?? 'none'}, ` +
        `AI PR description mode: ${execution.ai.getPullRequestDescriptionMode()}, bugbot min severity: ${execution.ai.getBugbotMinSeverity()}.`,
    );

    const results = await mainRun(
        execution,
        projectBoard.command,
        new GitCliRepository(token),
        'github-workflow',
        createSynchronizeLifecycleStateUseCase(),
        createSynchronizeAgentActivityUseCase(),
    );
    const issueContentPort = createIssueContentCompositionRoot();
    await finishGithubAction(
        execution,
        results,
        createIssueNotificationRepository(),
        new ConfigurationHandler(issueContentPort),
        createCopilotEvidenceCompositionRoot(),
        createGithubActionSummaryCompositionRoot(),
    );
}

/**
 * Runs the action entrypoint without forcing a successful process exit.
 *
 * `@actions/core.setFailed` deliberately communicates failure through
 * `process.exitCode`. Calling `process.exit(0)` after a resolved workflow would
 * overwrite that signal (for example when Bugbot is configured to fail on
 * unresolved findings), so this boundary must let Node exit naturally.
 */
export async function runGitHubActionEntry(
    run: () => Promise<void> = runGitHubAction,
): Promise<void> {
    return runAtApplicationErrorBoundary(async () => {
        try {
            await run();
        } catch (cause: unknown) {
            const semanticError = toApplicationError(cause, 'workflow.failed', 'GitHub Action execution failed.');
            logError(semanticError);
            core.setFailed(renderApplicationErrorText(semanticError));
        }
    });
}

// Only auto-run when executed as the action entry (not when imported by tests)
if (typeof process.env.JEST_WORKER_ID === 'undefined') {
    void runGitHubActionEntry();
}
