import { BUGBOT_MAX_COMMENTS, BUGBOT_MIN_SEVERITY } from '../application/policies/bugbot_constants';
import { INPUT_KEYS } from '../application/contracts/input_keys';
import { isEnabledInput } from './input_boolean_policy';
import { parseBoundedPositiveIntegerInput } from './input_number_policy';
import { parseDelimitedValues } from './input_values_policy';
import { buildAgentTasksFromInputs } from './agent_input_builder';
import type { AgentTaskConfiguration } from '../data/model/agent';
import { normalizePullRequestDescriptionMode, type PullRequestDescriptionMode } from '../domain/pull_request_description';
import { normalizeBugbotReviewEffort, parseBugbotOrganizationRules, type BugbotReviewConfiguration } from '../domain/bugbot/review_configuration';

export interface GithubActionAiInputs {
    readonly requestedAgentTasks: AgentTaskConfiguration;
    readonly pullRequestDescription: boolean;
    readonly pullRequestDescriptionMode: PullRequestDescriptionMode;
    readonly membersOnly: boolean;
    readonly includeReasoning: boolean;
    readonly ignoreFiles: string[];
    readonly bugbotSeverity: string;
    readonly bugbotCommentLimit: number;
    readonly bugbotFixVerifyCommands: string[];
    readonly bugbotReviewConfiguration: BugbotReviewConfiguration;
}

export function readGithubActionAgentTasks(
    getInput: (key: string) => string,
    _configurationSource?: string,
): AgentTaskConfiguration {
    return buildAgentTasksFromInputs(getInput);
}

export function readGithubActionAiInputs(getInput: (key: string) => string): GithubActionAiInputs {
    const requestedAgentTasks = buildAgentTasksFromInputs(getInput);
    const pullRequestDescription = isEnabledInput(getInput(INPUT_KEYS.AI_PULL_REQUEST_DESCRIPTION));
    const verifyCommands = getInput(INPUT_KEYS.BUGBOT_FIX_VERIFY_COMMANDS)
        .split(',')
        .map((command) => command.trim())
        .filter((command) => command.length > 0);

    return {
        requestedAgentTasks,
        pullRequestDescription,
        pullRequestDescriptionMode: pullRequestDescription
            ? normalizePullRequestDescriptionMode(getInput(INPUT_KEYS.AI_PULL_REQUEST_DESCRIPTION_MODE))
            : 'disabled',
        membersOnly: isEnabledInput(getInput(INPUT_KEYS.AI_MEMBERS_ONLY)),
        includeReasoning: isEnabledInput(getInput(INPUT_KEYS.AI_INCLUDE_REASONING)),
        ignoreFiles: parseDelimitedValues(getInput(INPUT_KEYS.AI_IGNORE_FILES)),
        bugbotSeverity: getInput(INPUT_KEYS.BUGBOT_SEVERITY) || BUGBOT_MIN_SEVERITY,
        bugbotCommentLimit: parseBoundedPositiveIntegerInput(getInput(INPUT_KEYS.BUGBOT_COMMENT_LIMIT), BUGBOT_MAX_COMMENTS, 200),
        bugbotFixVerifyCommands: verifyCommands,
        bugbotReviewConfiguration: {
            publicationMode: isEnabledInput(getInput(INPUT_KEYS.BUGBOT_DRY_RUN)) ? 'dry-run' : 'publish',
            effort: normalizeBugbotReviewEffort(getInput(INPUT_KEYS.BUGBOT_EFFORT)),
            reviewDrafts: isEnabledInput(getInput(INPUT_KEYS.BUGBOT_REVIEW_DRAFTS)),
            traceRules: isEnabledInput(getInput(INPUT_KEYS.BUGBOT_TRACE_RULES)),
            suggestedChanges: getInput(INPUT_KEYS.BUGBOT_SUGGESTED_CHANGES).trim().toLowerCase() !== 'false',
            telemetry: getInput(INPUT_KEYS.BUGBOT_TELEMETRY).trim().toLowerCase() !== 'false',
            failOnUnresolved: isEnabledInput(getInput(INPUT_KEYS.BUGBOT_FAIL_ON_UNRESOLVED)),
            organizationRules: parseBugbotOrganizationRules(getInput(INPUT_KEYS.BUGBOT_ORGANIZATION_RULES)),
        },
    };
}
