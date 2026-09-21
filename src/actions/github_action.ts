import * as core from '@actions/core';
import * as github from '@actions/github';
import { ConfigurationHandler } from '../manager/description/configuration_handler';
import { GitCliRepository } from '../data/repository/git_cli_repository';
import { createIssueContentCompositionRoot } from '../infrastructure/composition/issue_content_composition_root';
import { createProjectBoardCompositionRoot } from '../infrastructure/composition/project_board_composition_root';
import { finishGithubAction } from './github_action_completion';
import { getGithubActionInput } from './github_action_input';
import { isEnabledInput } from './input_boolean_policy';
import { buildGithubActionExecution, hydrateGithubActionExecutionProjects, readGithubActionSingleAction } from './github_action_execution';
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
import { activeAgentTasks, isUnaddressedCommentEvent } from '../application/policies/agent_task_activation_policy';
import { createActorAuthorizationRepository } from '../infrastructure/composition/actor_authorization_composition_root';
import { runAtApplicationErrorBoundary } from '../application/errors/application_error_context';
import { toApplicationError } from '../application/errors/application_error';
import { renderApplicationErrorText } from '../application/policies/application_error_presentation_policy';
import { bindIssueCommentPublication } from '../infrastructure/composition/push_single_action_capability_port_binding';
import { bindPublicationSourceQuery } from '../infrastructure/composition/shared_capability_port_binding';
import { GithubPublicationSourceRepository } from '../data/repository/github_publication_source_repository';
import { createBranchClient } from '../infrastructure/composition/github_branch_client_factory';
import { createLanguageQueryPort } from '../infrastructure/composition/agent_capability_composition_root';
import { ResolveMessageCatalogUseCase } from '../application/usecases/localization/resolve_message_catalog_use_case';
import { readGithubActionLocaleInputs } from './github_action_locale_inputs';
import { publicationLocaleNeedsDynamicCatalog } from '../application/policies/publication_message_catalog';
import {
    resolveStaticApplicationErrorCatalog,
    type ApplicationErrorMessageReader,
} from '../application/policies/application_error_message_catalog';
import { prepareGithubAgentRuntime } from './github_action_runtime';
import { runPullRequestApprovalAction } from './pull_request_approval_action';
import { isBotPullRequestAnalysisEvent } from '../application/policies/bot_pull_request_analysis_policy';
import { createPullRequestUseCaseCompositionRoot } from '../infrastructure/composition/pull_request_use_case_composition_root';

export async function runGitHubAction(): Promise<void> {
    if (isEnabledInput(getGithubActionInput('pr-approval-observer'))) {
        await runPullRequestApprovalAction(getGithubActionInput(INPUT_KEYS.TOKEN, { required: true }));
        return;
    }
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
    const botAnalysisOnly = admission.decision === 'discard' && isBotPullRequestAnalysisEvent({
        eventName: eventInputs.eventName,
        action: eventInputs.action,
        actor: eventInputs.actor,
        tokenUser: admission.tokenUser,
        repositoryId: github.context.payload.repository?.id,
        pullRequest: eventInputs.pull_request,
    });
    if (admission.decision === 'discard' && !botAnalysisOnly) {
        logInfo('GitHub Action: event actor matches the PAT user. Skipping normal pipeline before queue and mutation work.');
        return;
    }
    if (isUnaddressedCommentEvent(eventInputs, admission.tokenUser)) {
        logInfo('GitHub Action: comment does not address Copilot. Skipping before project, AI, and agent runtime work.');
        return;
    }

    const localeInputs = readGithubActionLocaleInputs(getGithubActionInput);
    const aiInputs = readGithubActionAiInputs(getGithubActionInput);
    const requestedActiveAgentTasks = [...new Set([
        ...activeAgentTasks(
            eventInputs,
            singleAction,
            admission.tokenUser,
            aiInputs.pullRequestDescriptionMode !== 'disabled',
        ),
        ...([localeInputs.repository, localeInputs.issue, localeInputs.pullRequest]
            .some(publicationLocaleNeedsDynamicCatalog) ? ['planner' as const] : []),
    ])];
    let languageRuntimeAvailable = false;

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
        activeAgentTasks: requestedActiveAgentTasks,
        localeInputs,
    });
    if (botAnalysisOnly) {
        // Bypass the normal lifecycle/issue route entirely. The only permitted
        // side effect is Bugbot's PR analysis and its own bounded presentation.
        execution.issueNumber = execution.pullRequest.number;
        prepareGithubAgentRuntime(aiInputs.requestedAgentTasks, ['reviewer']);
        const results = await createPullRequestUseCaseCompositionRoot({
            owner: execution.owner,
            repository: execution.repo,
            token,
        }).reviewOnly(execution);
        if (results.some(result => !result.success)) {
            throw new Error('Bot-authored pull-request analysis did not complete.');
        }
        await core.summary.addRaw('Copilot analyzed this bot-authored pull request. Native bot approval is never permitted.').write();
        return;
    }
    logDebugInfo(
        `Execution built. Event will be resolved in mainRun. Single action: ${execution.singleAction.currentSingleAction ?? 'none'}, ` +
        `AI PR description mode: ${execution.ai.getPullRequestDescriptionMode()}, bugbot min severity: ${execution.ai.getBugbotMinSeverity()}.`,
    );

    const repositoryBinding = {
        owner: execution.owner,
        repository: execution.repo,
        token: execution.tokens.token,
    };
    const results = await mainRun(
        execution,
        projectBoard.command,
        new GitCliRepository(token),
        'github-workflow',
        createSynchronizeLifecycleStateUseCase(repositoryBinding),
        createSynchronizeAgentActivityUseCase(repositoryBinding),
        async (admittedExecution) => {
            await hydrateGithubActionExecutionProjects(admittedExecution, {
                getInput: getGithubActionInput,
                projectQuery: projectBoard.query,
                token,
            });
            if (admittedExecution.issueWorkflowRuntimeMode !== 'execute') return;
            const agentRuntimeAuthorized = !aiInputs.membersOnly
                || requestedActiveAgentTasks.length === 0
                || await createActorAuthorizationRepository().isActorAllowedToUseMemberOnlyAutomation(
                    eventInputs.repo.owner,
                    eventInputs.repo.repo,
                    eventInputs.actor,
                    token,
                );
            if (!agentRuntimeAuthorized) {
                logInfo('Skipping agent runtime preparation because ai-members-only is enabled and the actor is not authorized.');
                return;
            }
            if (!singleAction.isCloseInactiveIssuesAction && requestedActiveAgentTasks.length > 0) {
                prepareGithubAgentRuntime(aiInputs.requestedAgentTasks, requestedActiveAgentTasks);
                languageRuntimeAvailable = requestedActiveAgentTasks.includes('planner');
            }
        },
    );
    const issueContentPort = createIssueContentCompositionRoot();
    const configurationHandler = new ConfigurationHandler(issueContentPort);
    await finishGithubAction(
        execution,
        results,
        bindIssueCommentPublication(issueContentPort, repositoryBinding),
        {
            update: (context) => configurationHandler.update({
                ...repositoryBinding,
                issueNumber: context.issueNumber,
            }, context),
        },
        createCopilotEvidenceCompositionRoot(),
        createGithubActionSummaryCompositionRoot(),
        new ResolveMessageCatalogUseCase(
            languageRuntimeAvailable ? createLanguageQueryPort() : undefined,
        ),
        bindPublicationSourceQuery(
            new GithubPublicationSourceRepository(createBranchClient()),
            repositoryBinding,
        ),
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
            core.setFailed(renderApplicationErrorText(semanticError, earlyGithubActionErrorMessage()));
        }
    });
}

function earlyGithubActionErrorMessage(): ApplicationErrorMessageReader {
    try {
        const locale = readGithubActionLocaleInputs(getGithubActionInput).repository;
        return resolveStaticApplicationErrorCatalog(locale).message;
    } catch {
        return resolveStaticApplicationErrorCatalog('en-US').message;
    }
}

// Only auto-run when executed as the action entry (not when imported by tests)
/* istanbul ignore next -- the bundled production entry is covered by the Action smoke path. */
if (typeof process.env.JEST_WORKER_ID === 'undefined') {
    void runGitHubActionEntry();
}
