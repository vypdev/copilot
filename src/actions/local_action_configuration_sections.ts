import { Locale } from '../data/model/locale';
import { BUGBOT_MAX_COMMENTS, BUGBOT_MIN_SEVERITY, INPUT_KEYS } from '../utils/constants';
import type { ProjectDetailQueryPort } from '../application/ports/project_detail_ports';
import type { ActionInputValues } from './action_input_source';
import { getActionInputsWithDefaults } from '../utils/yml_utils';
import { isEnabledInput } from './input_boolean_policy';
import { resolveActionInput } from './action_input_source';
import { loadProjectDetails } from './project_details_loader';
import { parseBoundedPositiveIntegerInput, parseIntegerInput, parseNonNegativeIntegerInput } from './input_number_policy';
import { parseDelimitedValues } from './input_values_policy';
import { buildAgentTasksFromValues } from './agent_input_builder';
import { buildImageConfiguration } from './image_configuration_builder';
import { normalizePullRequestDescriptionMode } from '../domain/pull_request_description';

export type LocalActionInputs = ReturnType<typeof getActionInputsWithDefaults>;

function input<T = string>(additionalParams: ActionInputValues, actionInputs: ActionInputValues, key: string): T {
    return resolveActionInput<T>(additionalParams, actionInputs, key);
}

export function readLocalCoreConfiguration(
    additionalParams: ActionInputValues,
    actionInputs: LocalActionInputs,
) {
    return {
        actionInputs,
        debug: isEnabledInput(input(additionalParams, actionInputs, INPUT_KEYS.DEBUG)),
        welcomeTitle: input<string>(additionalParams, actionInputs, INPUT_KEYS.WELCOME_TITLE),
        welcomeMessages: input<string[]>(additionalParams, actionInputs, INPUT_KEYS.WELCOME_MESSAGES),
        singleAction: input<string>(additionalParams, actionInputs, INPUT_KEYS.SINGLE_ACTION),
        singleActionIssue: input<string>(additionalParams, actionInputs, INPUT_KEYS.SINGLE_ACTION_ISSUE),
        singleActionVersion: input<string>(additionalParams, actionInputs, INPUT_KEYS.SINGLE_ACTION_VERSION),
        singleActionTitle: input<string>(additionalParams, actionInputs, INPUT_KEYS.SINGLE_ACTION_TITLE),
        singleActionChangelog: input<string>(additionalParams, actionInputs, INPUT_KEYS.SINGLE_ACTION_CHANGELOG),
        token: input<string>(additionalParams, actionInputs, INPUT_KEYS.TOKEN),
    };
}

export function readLocalAgentConfiguration(
    additionalParams: ActionInputValues,
    actionInputs: LocalActionInputs,
) {
    const agentTasks = buildAgentTasksFromValues({ ...actionInputs, ...additionalParams });
    const bugbotFixVerifyCommandsInput = input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_FIX_VERIFY_COMMANDS) ?? '';
    const pullRequestDescription = isEnabledInput(input(additionalParams, actionInputs, INPUT_KEYS.AI_PULL_REQUEST_DESCRIPTION));
    return {
        agentTasks,
        agentModel: agentTasks.findings.model,
        aiPullRequestDescription: pullRequestDescription,
        aiPullRequestDescriptionMode: pullRequestDescription
            ? normalizePullRequestDescriptionMode(input(additionalParams, actionInputs, INPUT_KEYS.AI_PULL_REQUEST_DESCRIPTION_MODE))
            : 'disabled',
        aiMembersOnly: isEnabledInput(input(additionalParams, actionInputs, INPUT_KEYS.AI_MEMBERS_ONLY)),
        aiIncludeReasoning: isEnabledInput(input(additionalParams, actionInputs, INPUT_KEYS.AI_INCLUDE_REASONING)),
        aiIgnoreFilesInput: input(additionalParams, actionInputs, INPUT_KEYS.AI_IGNORE_FILES),
        aiIgnoreFiles: parseDelimitedValues(input(additionalParams, actionInputs, INPUT_KEYS.AI_IGNORE_FILES)),
        bugbotSeverity: input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_SEVERITY) || BUGBOT_MIN_SEVERITY,
        bugbotCommentLimitRaw: input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_COMMENT_LIMIT),
        bugbotCommentLimit: parseBoundedPositiveIntegerInput(
            input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_COMMENT_LIMIT),
            BUGBOT_MAX_COMMENTS,
            200,
        ),
        bugbotFixVerifyCommandsInput,
        bugbotFixVerifyCommands: String(bugbotFixVerifyCommandsInput)
            .split(',')
            .map((command) => command.trim())
            .filter(Boolean),
    };
}

export async function readLocalProjectConfiguration(
    additionalParams: ActionInputValues,
    actionInputs: LocalActionInputs,
    projectRepository: ProjectDetailQueryPort,
    token: string | undefined,
) {
    const projectIdsInput = input(additionalParams, actionInputs, INPUT_KEYS.PROJECT_IDS);
    const projectIds = parseDelimitedValues(projectIdsInput);
    const repository = additionalParams.repo;
    const owner = repository && typeof repository === 'object'
        ? String((repository as { owner?: unknown }).owner ?? '')
        : '';
    const projects = await loadProjectDetails(projectRepository, projectIds, owner, token ?? '');

    return {
        projectIdsInput,
        projectIds,
        projects,
        projectColumnIssueCreated: input(additionalParams, actionInputs, INPUT_KEYS.PROJECT_COLUMN_ISSUE_CREATED),
        projectColumnPullRequestCreated: input(additionalParams, actionInputs, INPUT_KEYS.PROJECT_COLUMN_PULL_REQUEST_CREATED),
        projectColumnIssueInProgress: input(additionalParams, actionInputs, INPUT_KEYS.PROJECT_COLUMN_ISSUE_IN_PROGRESS),
        projectColumnPullRequestInProgress: input(additionalParams, actionInputs, INPUT_KEYS.PROJECT_COLUMN_PULL_REQUEST_IN_PROGRESS),
    };
}

function readIssueType(
    additionalParams: ActionInputValues,
    actionInputs: LocalActionInputs,
    name: string,
    description: string,
    color: string,
) {
    return {
        name: input(additionalParams, actionInputs, name),
        description: input(additionalParams, actionInputs, description),
        color: input(additionalParams, actionInputs, color),
    };
}

export function readLocalLabelsAndIssueTypes(
    additionalParams: ActionInputValues,
    actionInputs: LocalActionInputs,
) {
    const label = (key: string) => input(additionalParams, actionInputs, key);
    const issueTypeBug = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_BUG, INPUT_KEYS.ISSUE_TYPE_BUG_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_BUG_COLOR);
    const issueTypeHotfix = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_HOTFIX, INPUT_KEYS.ISSUE_TYPE_HOTFIX_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_HOTFIX_COLOR);
    const issueTypeFeature = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_FEATURE, INPUT_KEYS.ISSUE_TYPE_FEATURE_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_FEATURE_COLOR);
    const issueTypeDocumentation = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_DOCUMENTATION, INPUT_KEYS.ISSUE_TYPE_DOCUMENTATION_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_DOCUMENTATION_COLOR);
    const issueTypeMaintenance = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_MAINTENANCE, INPUT_KEYS.ISSUE_TYPE_MAINTENANCE_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_MAINTENANCE_COLOR);
    const issueTypeRelease = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_RELEASE, INPUT_KEYS.ISSUE_TYPE_RELEASE_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_RELEASE_COLOR);
    const issueTypeQuestion = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_QUESTION, INPUT_KEYS.ISSUE_TYPE_QUESTION_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_QUESTION_COLOR);
    const issueTypeHelp = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_HELP, INPUT_KEYS.ISSUE_TYPE_HELP_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_HELP_COLOR);
    const issueTypeTask = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_TASK, INPUT_KEYS.ISSUE_TYPE_TASK_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_TASK_COLOR);
    return {
        labels: {
            branchManagementLauncherLabel: label(INPUT_KEYS.BRANCH_MANAGEMENT_LAUNCHER_LABEL),
            bugfixLabel: label(INPUT_KEYS.BUGFIX_LABEL),
            bugLabel: label(INPUT_KEYS.BUG_LABEL),
            hotfixLabel: label(INPUT_KEYS.HOTFIX_LABEL),
            enhancementLabel: label(INPUT_KEYS.ENHANCEMENT_LABEL),
            featureLabel: label(INPUT_KEYS.FEATURE_LABEL),
            releaseLabel: label(INPUT_KEYS.RELEASE_LABEL),
            questionLabel: label(INPUT_KEYS.QUESTION_LABEL),
            helpLabel: label(INPUT_KEYS.HELP_LABEL),
            deployLabel: label(INPUT_KEYS.DEPLOY_LABEL),
            deployedLabel: label(INPUT_KEYS.DEPLOYED_LABEL),
            docsLabel: label(INPUT_KEYS.DOCS_LABEL),
            documentationLabel: label(INPUT_KEYS.DOCUMENTATION_LABEL),
            choreLabel: label(INPUT_KEYS.CHORE_LABEL),
            maintenanceLabel: label(INPUT_KEYS.MAINTENANCE_LABEL),
            priorityHighLabel: label(INPUT_KEYS.PRIORITY_HIGH_LABEL),
            priorityMediumLabel: label(INPUT_KEYS.PRIORITY_MEDIUM_LABEL),
            priorityLowLabel: label(INPUT_KEYS.PRIORITY_LOW_LABEL),
            priorityNoneLabel: label(INPUT_KEYS.PRIORITY_NONE_LABEL),
            sizeXxlLabel: label(INPUT_KEYS.SIZE_XXL_LABEL),
            sizeXlLabel: label(INPUT_KEYS.SIZE_XL_LABEL),
            sizeLLabel: label(INPUT_KEYS.SIZE_L_LABEL),
            sizeMLabel: label(INPUT_KEYS.SIZE_M_LABEL),
            sizeSLabel: label(INPUT_KEYS.SIZE_S_LABEL),
            sizeXsLabel: label(INPUT_KEYS.SIZE_XS_LABEL),
            lifecycle: {
                aiProcessing: label(INPUT_KEYS.STATE_AI_PROCESSING_LABEL),
                planned: label(INPUT_KEYS.STATE_PLANNED_LABEL),
                inProgress: label(INPUT_KEYS.STATE_IN_PROGRESS_LABEL),
                reviewing: label(INPUT_KEYS.STATE_REVIEWING_LABEL),
                changesRequested: label(INPUT_KEYS.STATE_CHANGES_REQUESTED_LABEL),
                verified: label(INPUT_KEYS.STATE_VERIFIED_LABEL),
                ready: label(INPUT_KEYS.STATE_READY_LABEL),
                blocked: label(INPUT_KEYS.STATE_BLOCKED_LABEL),
                awaitingMaintainer: label(INPUT_KEYS.STATE_AWAITING_MAINTAINER_LABEL),
                awaitingIssueAuthor: label(INPUT_KEYS.STATE_AWAITING_ISSUE_AUTHOR_LABEL),
            },
        },
        issueTypes: {
            issueTypeBug: issueTypeBug.name,
            issueTypeBugDescription: issueTypeBug.description,
            issueTypeBugColor: issueTypeBug.color,
            issueTypeHotfix: issueTypeHotfix.name,
            issueTypeHotfixDescription: issueTypeHotfix.description,
            issueTypeHotfixColor: issueTypeHotfix.color,
            issueTypeFeature: issueTypeFeature.name,
            issueTypeFeatureDescription: issueTypeFeature.description,
            issueTypeFeatureColor: issueTypeFeature.color,
            issueTypeDocumentation: issueTypeDocumentation.name,
            issueTypeDocumentationDescription: issueTypeDocumentation.description,
            issueTypeDocumentationColor: issueTypeDocumentation.color,
            issueTypeMaintenance: issueTypeMaintenance.name,
            issueTypeMaintenanceDescription: issueTypeMaintenance.description,
            issueTypeMaintenanceColor: issueTypeMaintenance.color,
            issueTypeRelease: issueTypeRelease.name,
            issueTypeReleaseDescription: issueTypeRelease.description,
            issueTypeReleaseColor: issueTypeRelease.color,
            issueTypeQuestion: issueTypeQuestion.name,
            issueTypeQuestionDescription: issueTypeQuestion.description,
            issueTypeQuestionColor: issueTypeQuestion.color,
            issueTypeHelp: issueTypeHelp.name,
            issueTypeHelpDescription: issueTypeHelp.description,
            issueTypeHelpColor: issueTypeHelp.color,
            issueTypeTask: issueTypeTask.name,
            issueTypeTaskDescription: issueTypeTask.description,
            issueTypeTaskColor: issueTypeTask.color,
        },
    };
}

function readThresholds(additionalParams: ActionInputValues, actionInputs: LocalActionInputs) {
    const read = (key: string, fallback: number) => parseIntegerInput(input(additionalParams, actionInputs, key), fallback);
    const groups = {
        Xxl: [INPUT_KEYS.SIZE_XXL_THRESHOLD_LINES, INPUT_KEYS.SIZE_XXL_THRESHOLD_FILES, INPUT_KEYS.SIZE_XXL_THRESHOLD_COMMITS, 1000, 20, 10],
        Xl: [INPUT_KEYS.SIZE_XL_THRESHOLD_LINES, INPUT_KEYS.SIZE_XL_THRESHOLD_FILES, INPUT_KEYS.SIZE_XL_THRESHOLD_COMMITS, 500, 10, 5],
        L: [INPUT_KEYS.SIZE_L_THRESHOLD_LINES, INPUT_KEYS.SIZE_L_THRESHOLD_FILES, INPUT_KEYS.SIZE_L_THRESHOLD_COMMITS, 250, 5, 3],
        M: [INPUT_KEYS.SIZE_M_THRESHOLD_LINES, INPUT_KEYS.SIZE_M_THRESHOLD_FILES, INPUT_KEYS.SIZE_M_THRESHOLD_COMMITS, 100, 3, 2],
        S: [INPUT_KEYS.SIZE_S_THRESHOLD_LINES, INPUT_KEYS.SIZE_S_THRESHOLD_FILES, INPUT_KEYS.SIZE_S_THRESHOLD_COMMITS, 50, 2, 1],
        Xs: [INPUT_KEYS.SIZE_XS_THRESHOLD_LINES, INPUT_KEYS.SIZE_XS_THRESHOLD_FILES, INPUT_KEYS.SIZE_XS_THRESHOLD_COMMITS, 25, 1, 1],
    } as const;
    const values = Object.fromEntries(Object.entries(groups).flatMap(([name, [linesKey, filesKey, commitsKey, linesFallback, filesFallback, commitsFallback]]) => [
        [`size${name}ThresholdLines`, read(linesKey, linesFallback)],
        [`size${name}ThresholdFiles`, read(filesKey, filesFallback)],
        [`size${name}ThresholdCommits`, read(commitsKey, commitsFallback)],
    ])) as Record<string, number>;
    return {
        sizeXxlThresholdLines: values.sizeXxlThresholdLines,
        sizeXxlThresholdFiles: values.sizeXxlThresholdFiles,
        sizeXxlThresholdCommits: values.sizeXxlThresholdCommits,
        sizeXlThresholdLines: values.sizeXlThresholdLines,
        sizeXlThresholdFiles: values.sizeXlThresholdFiles,
        sizeXlThresholdCommits: values.sizeXlThresholdCommits,
        sizeLThresholdLines: values.sizeLThresholdLines,
        sizeLThresholdFiles: values.sizeLThresholdFiles,
        sizeLThresholdCommits: values.sizeLThresholdCommits,
        sizeMThresholdLines: values.sizeMThresholdLines,
        sizeMThresholdFiles: values.sizeMThresholdFiles,
        sizeMThresholdCommits: values.sizeMThresholdCommits,
        sizeSThresholdLines: values.sizeSThresholdLines,
        sizeSThresholdFiles: values.sizeSThresholdFiles,
        sizeSThresholdCommits: values.sizeSThresholdCommits,
        sizeXsThresholdLines: values.sizeXsThresholdLines,
        sizeXsThresholdFiles: values.sizeXsThresholdFiles,
        sizeXsThresholdCommits: values.sizeXsThresholdCommits,
    };
}

export function readLocalWorkflowConfiguration(
    additionalParams: ActionInputValues,
    actionInputs: LocalActionInputs,
) {
    const read = (key: string) => input(additionalParams, actionInputs, key);
    return {
        imageConfiguration: buildImageConfiguration((key) => additionalParams[key] ?? actionInputs[key]),
        releaseWorkflow: read(INPUT_KEYS.RELEASE_WORKFLOW),
        hotfixWorkflow: read(INPUT_KEYS.HOTFIX_WORKFLOW),
        titleEmoji: read(INPUT_KEYS.EMOJI_LABELED_TITLE) === 'true',
        branchManagementEmoji: read(INPUT_KEYS.BRANCH_MANAGEMENT_EMOJI),
        issueLocale: read(INPUT_KEYS.ISSUES_LOCALE) ?? Locale.DEFAULT,
        pullRequestLocale: read(INPUT_KEYS.PULL_REQUESTS_LOCALE) ?? Locale.DEFAULT,
        ...readThresholds(additionalParams, actionInputs),
        mainBranch: read(INPUT_KEYS.MAIN_BRANCH),
        developmentBranch: read(INPUT_KEYS.DEVELOPMENT_BRANCH),
        featureTree: read(INPUT_KEYS.FEATURE_TREE),
        bugfixTree: read(INPUT_KEYS.BUGFIX_TREE),
        hotfixTree: read(INPUT_KEYS.HOTFIX_TREE),
        releaseTree: read(INPUT_KEYS.RELEASE_TREE),
        docsTree: read(INPUT_KEYS.DOCS_TREE),
        choreTree: read(INPUT_KEYS.CHORE_TREE),
        commitPrefixBuilder: read(INPUT_KEYS.COMMIT_PREFIX_TRANSFORMS) || 'replace-slash',
        branchManagementAlways: isEnabledInput(read(INPUT_KEYS.BRANCH_MANAGEMENT_ALWAYS)),
        reopenIssueOnPush: isEnabledInput(read(INPUT_KEYS.REOPEN_ISSUE_ON_PUSH)),
        issueDesiredAssigneesCount: parseIntegerInput(read(INPUT_KEYS.DESIRED_ASSIGNEES_COUNT), 0),
        pullRequestDesiredAssigneesCount: parseIntegerInput(read(INPUT_KEYS.PULL_REQUEST_DESIRED_ASSIGNEES_COUNT), 0),
        pullRequestDesiredReviewersCount: parseIntegerInput(read(INPUT_KEYS.PULL_REQUEST_DESIRED_REVIEWERS_COUNT), 0),
        pullRequestMergeTimeout: parseNonNegativeIntegerInput(read(INPUT_KEYS.PULL_REQUEST_MERGE_TIMEOUT), 0),
    };
}
