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
import { buildGithubActionExecution } from './github_action_execution';
import { buildGithubActionEventInputs } from './github_event_inputs';
import { mainRun } from './common_action';
import { INPUT_KEYS } from '../utils/constants';
import { logDebugInfo, logError, logInfo } from '../utils/logger';
import { createSynchronizeLifecycleStateUseCase } from '../infrastructure/composition/lifecycle_state_composition_root';
import { createCopilotEvidenceCompositionRoot } from '../infrastructure/composition/copilot_evidence_composition_root';
import { createGithubActionSummaryCompositionRoot } from '../infrastructure/composition/github_action_summary_composition_root';

export async function runGitHubAction(): Promise<void> {
    const eventInputs = buildGithubActionEventInputs({
        payload: github.context.payload as Record<string, unknown>,
        eventName: github.context.eventName,
        actor: github.context.actor,
        repo: github.context.repo,
    });
    const projectBoard = createProjectBoardCompositionRoot();

    logInfo('GitHub Action: runGitHubAction started.');
    const debug = isEnabledInput(getGithubActionInput(INPUT_KEYS.DEBUG));
    if (debug) {
        logInfo('Debug mode is enabled. Full logs will be included in the report.');
    }

    const execution = await buildGithubActionExecution({
        debug,
        eventInputs,
        getInput: getGithubActionInput,
        projectQuery: projectBoard.query,
    });
    logDebugInfo(
        `Execution built. Event will be resolved in mainRun. Single action: ${execution.singleAction.currentSingleAction ?? 'none'}, ` +
        `AI PR description: ${execution.ai.getAiPullRequestDescription()}, bugbot min severity: ${execution.ai.getBugbotMinSeverity()}.`,
    );

    const results = await mainRun(
        execution,
        projectBoard.command,
        new GitCliRepository(),
        createSynchronizeLifecycleStateUseCase(),
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

// Only auto-run when executed as the action entry (not when imported by tests)
if (typeof process.env.JEST_WORKER_ID === 'undefined') {
    runGitHubAction()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
            logError(error);
            core.setFailed(error instanceof Error ? error.message : String(error));
            process.exit(1);
        });
}
