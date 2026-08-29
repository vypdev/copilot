import * as core from '@actions/core';
import * as github from '@actions/github';
import { Ai } from '../data/model/ai';



import { Hotfix } from '../data/model/hotfix';






import { Release } from '../data/model/release';
import { Result } from '../data/model/result';
import { SingleAction } from '../data/model/single_action';


import { finishGithubAction } from './github_action_completion';
import { ConfigurationHandler } from '../manager/description/configuration_handler';
import { INPUT_KEYS } from '../utils/constants';
import { logDebugInfo, logError, logInfo } from '../utils/logger';
import { GitCliRepository } from '../data/repository/git_cli_repository';
import { createIssueContentCompositionRoot } from '../infrastructure/composition/issue_content_composition_root';

import { createIssueNotificationRepository } from '../infrastructure/composition/issue_interaction_composition_root';
import { createProjectBoardCompositionRoot } from '../infrastructure/composition/project_board_composition_root';

import { loadProjectDetails } from './project_details_loader';
import { mainRun } from './common_action';
import { isEnabledInput } from './input_boolean_policy';
import { getGithubActionInput } from './github_action_input';
import { parseIntegerInput } from './input_number_policy';
import { parseDelimitedValues } from './input_values_policy';
import { readGithubActionAiInputs } from './github_action_ai_inputs';
import { AgentCliProvisioner } from '../data/repository/agent_cli_provisioner';
import { runAgentAuthenticationPreflight } from '../data/repository/agent_authentication_preflight';
import { readGithubActionImageInputs } from './github_action_image_inputs';
import { readGithubActionLocaleInputs } from './github_action_locale_inputs';
import { buildSizeThresholds } from './size_threshold_builder';
import { readGithubActionThresholdInputs } from './github_action_threshold_inputs';
import { buildBranches } from './branches_builder';
import { readGithubActionBranchInputs } from './github_action_branch_inputs';
import { readGithubActionLabelInputs } from './github_action_label_inputs';
import { readGithubActionWorkflowInputs } from './github_action_workflow_inputs';
import { readGithubActionIssueTypeInputs } from './github_action_issue_type_inputs';
import { readGithubActionProjectInputs } from './github_action_project_inputs';
import { buildExecution } from './execution_builder';
import { buildEmoji, buildImages, buildIssue, buildIssueTypes, buildLabels, buildLocale, buildProjects, buildPullRequest, buildTokens, buildWorkflows } from './configuration_builders';
import { buildGithubActionEventInputs } from './github_event_inputs';

export async function runGitHubAction(): Promise<void> {
    const eventInputs = buildGithubActionEventInputs({
        payload: github.context.payload as Record<string, unknown>,
        eventName: github.context.eventName,
        actor: github.context.actor,
        repo: github.context.repo,
    });
    const projectBoard = createProjectBoardCompositionRoot();

    logInfo('GitHub Action: runGitHubAction started.');

    /**
     * Debug
     */
    const debug = isEnabledInput(getGithubActionInput(INPUT_KEYS.DEBUG));
    if (debug) {
        logInfo('Debug mode is enabled. Full logs will be included in the report.');
    }

    /**
     * Single action
     */
    const singleAction = getGithubActionInput(INPUT_KEYS.SINGLE_ACTION);
    const singleActionIssue = getGithubActionInput(INPUT_KEYS.SINGLE_ACTION_ISSUE);
    const singleActionVersion = getGithubActionInput(INPUT_KEYS.SINGLE_ACTION_VERSION);
    const singleActionTitle = getGithubActionInput(INPUT_KEYS.SINGLE_ACTION_TITLE);
    const singleActionChangelog = getGithubActionInput(INPUT_KEYS.SINGLE_ACTION_CHANGELOG);

    /**
     * Tokens
     */
    const token = getGithubActionInput(INPUT_KEYS.TOKEN, {required: true});

    /**
     * Agent runtime
     */
    const aiInputs = readGithubActionAiInputs(getGithubActionInput);
    const agentTasks = aiInputs.requestedAgentTasks;
    for (const [task, configuration] of [['findings', agentTasks.findings], ['fixer', agentTasks.fixer]] as const) {
        const preflight = runAgentAuthenticationPreflight(configuration);
        if (preflight.check.status === 'missing' && preflight.shouldFail) {
            throw new Error(`${task} agent authentication failed: ${preflight.check.message}`);
        }
        if (preflight.check.status === 'missing' && preflight.mode === 'warn') {
            logInfo(`Warning: ${task} agent authentication could not be preflighted: ${preflight.check.message}`);
        }
    }
    if (process.env.GITHUB_ACTIONS === 'true') {
        const provisioner = new AgentCliProvisioner();
        for (const configuration of [agentTasks.findings, agentTasks.fixer]) {
            provisioner.provision(configuration);
        }
    }
    logDebugInfo(`Using ${agentTasks.findings.provider} CLI for findings (${agentTasks.findings.modelProvider ?? 'default'}/${agentTasks.findings.model}) and ${agentTasks.fixer.provider} CLI for fixer (${agentTasks.fixer.modelProvider ?? 'default'}/${agentTasks.fixer.model}).`);


    const aiPullRequestDescription = aiInputs.pullRequestDescription;
    const aiMembersOnly = aiInputs.membersOnly;
    const aiIncludeReasoning = aiInputs.includeReasoning;
    const aiIgnoreFiles = aiInputs.ignoreFiles;
    const bugbotSeverity = aiInputs.bugbotSeverity;
    const bugbotCommentLimit = aiInputs.bugbotCommentLimit;
    const bugbotFixVerifyCommands = aiInputs.bugbotFixVerifyCommands;

    /**
     * Projects Details
     */
    const projectIdsInput: string = getGithubActionInput(INPUT_KEYS.PROJECT_IDS);
    const projectIds: string[] = parseDelimitedValues(projectIdsInput);

    const projects = await loadProjectDetails(
        projectBoard.query,
        projectIds,
        eventInputs.repo.owner,
        token,
    );

    const projectInputs = readGithubActionProjectInputs(getGithubActionInput, projects);

    /**
     * Images
     */
    const imageConfiguration = readGithubActionImageInputs(getGithubActionInput);
    const workflowInputs = readGithubActionWorkflowInputs(getGithubActionInput);

    /**
     * Emoji-title
     */
    const titleEmoji = getGithubActionInput(INPUT_KEYS.EMOJI_LABELED_TITLE) === 'true';
    const branchManagementEmoji = getGithubActionInput(INPUT_KEYS.BRANCH_MANAGEMENT_EMOJI);

    const labelInputs = readGithubActionLabelInputs(getGithubActionInput);

    const issueTypeInputs = readGithubActionIssueTypeInputs(getGithubActionInput);

    const localeInputs = readGithubActionLocaleInputs(getGithubActionInput);

    const sizeThresholdInputs = readGithubActionThresholdInputs(getGithubActionInput);
    const branchInputs = readGithubActionBranchInputs(getGithubActionInput);

    /**
     * Prefix builder
     */
    let commitPrefixBuilder = getGithubActionInput(INPUT_KEYS.COMMIT_PREFIX_TRANSFORMS) ?? '';
    if (commitPrefixBuilder.length === 0) {
        commitPrefixBuilder = 'replace-slash';
    }

    /**
     * Issue
     */
    const branchManagementAlways = isEnabledInput(getGithubActionInput(INPUT_KEYS.BRANCH_MANAGEMENT_ALWAYS));
    const reopenIssueOnPush = isEnabledInput(getGithubActionInput(INPUT_KEYS.REOPEN_ISSUE_ON_PUSH));
    const issueDesiredAssigneesCount = parseIntegerInput(getGithubActionInput(INPUT_KEYS.DESIRED_ASSIGNEES_COUNT), 0);

    /**
     * Pull Request
     */
    const pullRequestDesiredAssigneesCount = parseIntegerInput(getGithubActionInput(INPUT_KEYS.PULL_REQUEST_DESIRED_ASSIGNEES_COUNT), 0);
    const pullRequestDesiredReviewersCount = parseIntegerInput(getGithubActionInput(INPUT_KEYS.PULL_REQUEST_DESIRED_REVIEWERS_COUNT), 0);
    const pullRequestMergeTimeout = parseIntegerInput(getGithubActionInput(INPUT_KEYS.PULL_REQUEST_MERGE_TIMEOUT), 0);

    const execution = buildExecution({
        debug,
        singleAction: new SingleAction(
            singleAction,
            singleActionIssue,
            singleActionVersion,
            singleActionTitle,
            singleActionChangelog,
        ),
        commitPrefixBuilder,
        issue: buildIssue(branchManagementAlways, reopenIssueOnPush, issueDesiredAssigneesCount, eventInputs),
        pullRequest: buildPullRequest(pullRequestDesiredAssigneesCount, pullRequestDesiredReviewersCount, pullRequestMergeTimeout, eventInputs),
        emoji: buildEmoji(titleEmoji, branchManagementEmoji),
        images: buildImages({
            onIssue: imageConfiguration.onIssue,
            onPullRequest: imageConfiguration.onPullRequest,
            onCommit: imageConfiguration.onCommit,
            issue: imageConfiguration.issue,
            pullRequest: imageConfiguration.pullRequest,
            commit: imageConfiguration.commit,
        }),
        tokens: buildTokens(token),
        ai: new Ai(
            '',
            agentTasks.findings.model,
            aiPullRequestDescription,
            aiMembersOnly,
            aiIgnoreFiles,
            aiIncludeReasoning,
            bugbotSeverity,
            bugbotCommentLimit,
            bugbotFixVerifyCommands,
            agentTasks,
        ),
        labels: buildLabels(labelInputs),
        issueTypes: buildIssueTypes(issueTypeInputs),
        locale: buildLocale(localeInputs.issue, localeInputs.pullRequest),
        sizeThresholds: buildSizeThresholds(sizeThresholdInputs),
        branches: buildBranches(branchInputs),
        release: new Release(),
        hotfix: new Hotfix(),
        workflows: buildWorkflows(workflowInputs.release, workflowInputs.hotfix),
        projects: buildProjects(projectInputs),
        inputs: eventInputs,
    });

    logDebugInfo(`Execution built. Event will be resolved in mainRun. Single action: ${execution.singleAction.currentSingleAction ?? 'none'}, AI PR description: ${execution.ai.getAiPullRequestDescription()}, bugbot min severity: ${execution.ai.getBugbotMinSeverity()}.`);

    const results: Result[] = await mainRun(execution, projectBoard.command, new GitCliRepository());

    const issueContentPort = createIssueContentCompositionRoot();
    await finishGithubAction(
        execution,
        results,
        createIssueNotificationRepository(),
        new ConfigurationHandler(issueContentPort),
    );
}

// Only auto-run when executed as the action entry (not when imported by tests)
if (typeof process.env.JEST_WORKER_ID === 'undefined') {
    runGitHubAction()
        .then(() => process.exit(0))
        .catch((err: unknown) => {
            logError(err);
            core.setFailed(err instanceof Error ? err.message : String(err));
            process.exit(1);
        });
}
