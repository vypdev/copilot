import { Ai } from '../data/model/ai';
import { Hotfix } from '../data/model/hotfix';
import { Release } from '../data/model/release';
import { SingleAction } from '../data/model/single_action';
import type { Execution } from '../data/model/execution';
import type { ProjectDetailQueryPort } from '../application/ports/project_detail_ports';
import { INPUT_KEYS } from '../utils/constants';
import { isEnabledInput } from './input_boolean_policy';
import { getGithubActionInput } from './github_action_input';
import { parseIntegerInput, parseNonNegativeIntegerInput } from './input_number_policy';
import { parseDelimitedValues } from './input_values_policy';
import { readGithubActionAiInputs } from './github_action_ai_inputs';
import { prepareGithubAgentRuntime } from './github_action_runtime';
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
import { loadProjectDetails } from './project_details_loader';
import type { buildGithubActionEventInputs } from './github_event_inputs';

export interface GithubActionExecutionInput {
    readonly getInput: typeof getGithubActionInput;
    readonly eventInputs: ReturnType<typeof buildGithubActionEventInputs>;
    readonly projectQuery: ProjectDetailQueryPort;
    readonly debug: boolean;
    readonly token: string;
    readonly tokenUser: string;
    readonly singleAction: SingleAction;
}

export async function buildGithubActionExecution(
    input: GithubActionExecutionInput,
): Promise<Execution> {
    const { getInput, eventInputs, projectQuery, debug, singleAction, token } = input;
    const aiInputs = readGithubActionAiInputs(getInput);
    prepareGithubAgentRuntime(aiInputs.requestedAgentTasks);

    const projects = await loadProjectDetails(
        projectQuery,
        parseDelimitedValues(getInput(INPUT_KEYS.PROJECT_IDS)),
        eventInputs.repo.owner,
        token,
    );
    const projectInputs = readGithubActionProjectInputs(getInput, projects);
    const imageConfiguration = readGithubActionImageInputs(getInput);
    const workflowInputs = readGithubActionWorkflowInputs(getInput);
    const labelInputs = readGithubActionLabelInputs(getInput);
    const issueTypeInputs = readGithubActionIssueTypeInputs(getInput);
    const localeInputs = readGithubActionLocaleInputs(getInput);
    const sizeThresholdInputs = readGithubActionThresholdInputs(getInput);
    const branchInputs = readGithubActionBranchInputs(getInput);

    return buildExecution({
        debug,
        singleAction,
        commitPrefixBuilder: getCommitPrefixBuilder(getInput),
        issue: buildIssue(
            isEnabledInput(getInput(INPUT_KEYS.BRANCH_MANAGEMENT_ALWAYS)),
            isEnabledInput(getInput(INPUT_KEYS.REOPEN_ISSUE_ON_PUSH)),
            parseIntegerInput(getInput(INPUT_KEYS.DESIRED_ASSIGNEES_COUNT), 0),
            eventInputs,
        ),
        pullRequest: buildPullRequest(
            parseIntegerInput(getInput(INPUT_KEYS.PULL_REQUEST_DESIRED_ASSIGNEES_COUNT), 0),
            parseIntegerInput(getInput(INPUT_KEYS.PULL_REQUEST_DESIRED_REVIEWERS_COUNT), 0),
            parseNonNegativeIntegerInput(getInput(INPUT_KEYS.PULL_REQUEST_MERGE_TIMEOUT), 0),
            eventInputs,
        ),
        emoji: buildEmoji(
            getInput(INPUT_KEYS.EMOJI_LABELED_TITLE) === 'true',
            getInput(INPUT_KEYS.BRANCH_MANAGEMENT_EMOJI),
        ),
        images: buildImages(imageConfiguration),
        tokens: buildTokens(token),
        ai: new Ai(
            '',
            aiInputs.requestedAgentTasks.findings.model,
            aiInputs.pullRequestDescription,
            aiInputs.membersOnly,
            aiInputs.ignoreFiles,
            aiInputs.includeReasoning,
            aiInputs.bugbotSeverity,
            aiInputs.bugbotCommentLimit,
            aiInputs.bugbotFixVerifyCommands,
            aiInputs.requestedAgentTasks,
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
        tokenUser: input.tokenUser,
        inputs: eventInputs,
    });
}

export function readGithubActionSingleAction(getInput: typeof getGithubActionInput): SingleAction {
    return new SingleAction(
        getInput(INPUT_KEYS.SINGLE_ACTION),
        getInput(INPUT_KEYS.SINGLE_ACTION_ISSUE),
        getInput(INPUT_KEYS.SINGLE_ACTION_VERSION),
        getInput(INPUT_KEYS.SINGLE_ACTION_TITLE),
        getInput(INPUT_KEYS.SINGLE_ACTION_CHANGELOG),
    );
}

function getCommitPrefixBuilder(getInput: typeof getGithubActionInput): string {
    return getInput(INPUT_KEYS.COMMIT_PREFIX_TRANSFORMS) || 'replace-slash';
}
