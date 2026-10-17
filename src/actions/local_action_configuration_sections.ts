import { Locale } from '../data/model/locale';
import { BUGBOT_MAX_COMMENTS, BUGBOT_MIN_SEVERITY } from '../application/policies/bugbot_constants';
import { INPUT_KEYS } from '../application/contracts/input_keys';
import type { ProjectDetailQueryPort } from '../application/ports/project_detail_ports';
import type { ActionInputValues } from './action_input_source';
import { getActionInputsWithDefaults } from '../utils/yml_utils';
import { isEnabledInput, parseIssueWorkflowBoolean } from './input_boolean_policy';
import { resolveActionInput } from './action_input_source';
import { loadProjectDetails } from './project_details_loader';
import { parseBoundedPositiveIntegerInput, parseIntegerInput } from './input_number_policy';
import { parseDelimitedValues } from './input_values_policy';
import { buildAgentTasksFromValues } from './agent_input_builder';
import { normalizePullRequestDescriptionMode } from '../domain/pull_request_description';
import { DEFAULT_INACTIVITY_THRESHOLD_HOURS, MAX_INACTIVITY_THRESHOLD_HOURS } from '../domain/issue_inactivity';
import { normalizeBugbotReviewEffort, parseBugbotOrganizationRules } from '../domain/bugbot/review_configuration';
import { readDeploymentConfiguration } from './deployment_configuration_builder';

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
        singleActionMessage: input<string>(additionalParams, actionInputs, INPUT_KEYS.SINGLE_ACTION_MESSAGE),
        singleActionOperationId: input<string>(additionalParams, actionInputs, INPUT_KEYS.SINGLE_ACTION_OPERATION_ID),
        singleActionCommentId: input<string>(additionalParams, actionInputs, INPUT_KEYS.SINGLE_ACTION_COMMENT_ID),
        singleActionCommentMode: input<string>(additionalParams, actionInputs, INPUT_KEYS.SINGLE_ACTION_COMMENT_MODE),
        inactivityThresholdHours: parseBoundedPositiveIntegerInput(
            input(additionalParams, actionInputs, INPUT_KEYS.INACTIVITY_THRESHOLD_HOURS),
            DEFAULT_INACTIVITY_THRESHOLD_HOURS,
            MAX_INACTIVITY_THRESHOLD_HOURS,
        ),
        token: input<string>(additionalParams, actionInputs, INPUT_KEYS.TOKEN),
    };
}

export function readLocalAgentConfiguration(
    additionalParams: ActionInputValues,
    actionInputs: LocalActionInputs,
) {
    const agentTasks = buildAgentTasksFromValues({ ...actionInputs, ...additionalParams });
    const bugbotFixVerifyCommandsInput = input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_FIX_VERIFY_COMMANDS) ?? '';
    return {
        agentTasks,
        agentModel: agentTasks.findings.model,
        aiPullRequestDescriptionMode: normalizePullRequestDescriptionMode(input(additionalParams, actionInputs, INPUT_KEYS.AI_PULL_REQUEST_DESCRIPTION_MODE)),
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
        bugbotReviewConfiguration: {
            publicationMode: isEnabledInput(input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_DRY_RUN)) ? 'dry-run' as const : 'publish' as const,
            effort: normalizeBugbotReviewEffort(input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_EFFORT)),
            reviewDrafts: isEnabledInput(input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_REVIEW_DRAFTS)),
            traceRules: isEnabledInput(input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_TRACE_RULES)),
            suggestedChanges: String(input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_SUGGESTED_CHANGES) ?? 'true').toLowerCase() !== 'false',
            telemetry: String(input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_TELEMETRY) ?? 'true').toLowerCase() !== 'false',
            failOnUnresolved: isEnabledInput(input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_FAIL_ON_UNRESOLVED)),
            organizationRules: parseBugbotOrganizationRules(input(additionalParams, actionInputs, INPUT_KEYS.BUGBOT_ORGANIZATION_RULES)),
        },
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

export { readLocalLabelsAndIssueTypes } from '../application/policies/issue_resource_input_policy';

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
    const mainBranch = read(INPUT_KEYS.MAIN_BRANCH);
    const developmentBranch = read(INPUT_KEYS.DEVELOPMENT_BRANCH);
    const releaseTree = read(INPUT_KEYS.RELEASE_TREE);
    const hotfixTree = read(INPUT_KEYS.HOTFIX_TREE);
    const locale = new Locale(
        read(INPUT_KEYS.REPOSITORY_LOCALE) || Locale.DEFAULT,
        read(INPUT_KEYS.ISSUES_LOCALE) || '',
        read(INPUT_KEYS.PULL_REQUESTS_LOCALE) || '',
    );
    return {
        releaseWorkflow: read(INPUT_KEYS.RELEASE_WORKFLOW),
        hotfixWorkflow: read(INPUT_KEYS.HOTFIX_WORKFLOW),
        titleEmoji: read(INPUT_KEYS.EMOJI_LABELED_TITLE) === 'true',
        branchManagementEmoji: read(INPUT_KEYS.BRANCH_MANAGEMENT_EMOJI),
        repositoryLocale: locale.repository,
        issueLocale: locale.issue,
        pullRequestLocale: locale.pullRequest,
        ...readThresholds(additionalParams, actionInputs),
        mainBranch,
        developmentBranch,
        featureTree: read(INPUT_KEYS.FEATURE_TREE),
        bugfixTree: read(INPUT_KEYS.BUGFIX_TREE),
        hotfixTree,
        releaseTree,
        docsTree: read(INPUT_KEYS.DOCS_TREE),
        choreTree: read(INPUT_KEYS.CHORE_TREE),
        commitPrefixBuilder: read(INPUT_KEYS.COMMIT_PREFIX_TRANSFORMS) || 'replace-slash',
        issueManagedBranches: parseIssueWorkflowBoolean(read(INPUT_KEYS.ISSUE_MANAGED_BRANCHES), INPUT_KEYS.ISSUE_MANAGED_BRANCHES, true),
        preBranchSdd: parseIssueWorkflowBoolean(read(INPUT_KEYS.PRE_BRANCH_SDD), INPUT_KEYS.PRE_BRANCH_SDD, false),
        reopenIssueOnPush: isEnabledInput(read(INPUT_KEYS.REOPEN_ISSUE_ON_PUSH)),
        issueDesiredAssigneesCount: parseIntegerInput(read(INPUT_KEYS.DESIRED_ASSIGNEES_COUNT), 0),
        pullRequestDesiredAssigneesCount: parseIntegerInput(read(INPUT_KEYS.PULL_REQUEST_DESIRED_ASSIGNEES_COUNT), 0),
        pullRequestDesiredReviewersCount: parseIntegerInput(read(INPUT_KEYS.PULL_REQUEST_DESIRED_REVIEWERS_COUNT), 0),
        deployment: readDeploymentConfiguration(read, {
            productionBranch: mainBranch,
            developmentBranch,
            releaseTree,
            hotfixTree,
        }),
    };
}
