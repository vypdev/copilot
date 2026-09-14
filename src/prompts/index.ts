/**
 * Prompt provider: one file per prompt, each exports a getter that fills the template with params.
 * Use getPrompt(name, params) for a generic call or import the typed getter (e.g. getAnswerIssueHelpPrompt).
 */
import { getAnswerIssueHelpPrompt } from './answer_issue_help';
import type { AnswerIssueHelpParams } from './answer_issue_help';
import { getThinkPrompt } from './think';
import type { ThinkParams } from './think';
import { getUpdatePullRequestDescriptionPrompt } from './update_pull_request_description';
import type { UpdatePullRequestDescriptionParams } from './update_pull_request_description';
import { getUserRequestPrompt } from './user_request';
import type { UserRequestParams } from './user_request';
import { getRecommendStepsPrompt } from './recommend_steps';
import type { RecommendStepsParams } from './recommend_steps';
import { getCheckProgressPrompt } from './check_progress';
import type { CheckProgressParams } from './check_progress';
import {
    getAdaptCommentLanguagePrompt,
    getTranslateCommentPrompt,
} from './check_comment_language';
import type { CheckCommentLanguageParams } from './check_comment_language';
import { getCliDoPrompt } from './cli_do';
import type { CliDoParams } from './cli_do';
import { getBugbotPrompt } from './bugbot';
import type { BugbotParams } from './bugbot';
import { getBugbotFixPrompt } from './bugbot_fix';
import type { BugbotFixParams } from './bugbot_fix';
import { getBugbotFixIntentPrompt } from './bugbot_fix_intent';
import type { BugbotFixIntentParams } from './bugbot_fix_intent';

export { fillTemplate } from './fill';
export { getAnswerIssueHelpPrompt } from './answer_issue_help';
export type { AnswerIssueHelpParams } from './answer_issue_help';
export { getThinkPrompt } from './think';
export type { ThinkParams } from './think';
export { getUpdatePullRequestDescriptionPrompt } from './update_pull_request_description';
export type { UpdatePullRequestDescriptionParams } from './update_pull_request_description';
export { getUserRequestPrompt } from './user_request';
export type { UserRequestParams } from './user_request';
export { getRecommendStepsPrompt } from './recommend_steps';
export type { RecommendStepsParams } from './recommend_steps';
export { getCheckProgressPrompt } from './check_progress';
export type { CheckProgressParams } from './check_progress';
export {
    getAdaptCommentLanguagePrompt,
    getTranslateCommentPrompt,
} from './check_comment_language';
export type { CheckCommentLanguageParams } from './check_comment_language';
export { getCliDoPrompt } from './cli_do';
export type { CliDoParams } from './cli_do';
export { getBugbotPrompt } from './bugbot';
export type { BugbotParams } from './bugbot';
export { getBugbotFixPrompt } from './bugbot_fix';
export type { BugbotFixParams } from './bugbot_fix';
export { getBugbotFixIntentPrompt } from './bugbot_fix_intent';
export type { BugbotFixIntentParams } from './bugbot_fix_intent';

/** Known prompt names for getPrompt() */
export const PROMPT_NAMES = {
    ANSWER_ISSUE_HELP: 'answer_issue_help',
    THINK: 'think',
    UPDATE_PULL_REQUEST_DESCRIPTION: 'update_pull_request_description',
    USER_REQUEST: 'user_request',
    RECOMMEND_STEPS: 'recommend_steps',
    CHECK_PROGRESS: 'check_progress',
    CHECK_COMMENT_LANGUAGE: 'check_comment_language',
    TRANSLATE_COMMENT: 'translate_comment',
    CLI_DO: 'cli_do',
    BUGBOT: 'bugbot',
    BUGBOT_FIX: 'bugbot_fix',
    BUGBOT_FIX_INTENT: 'bugbot_fix_intent',
} as const;

export type PromptName = (typeof PROMPT_NAMES)[keyof typeof PROMPT_NAMES];

type PromptParamsMap = {
    [PROMPT_NAMES.ANSWER_ISSUE_HELP]: AnswerIssueHelpParams;
    [PROMPT_NAMES.THINK]: ThinkParams;
    [PROMPT_NAMES.UPDATE_PULL_REQUEST_DESCRIPTION]: UpdatePullRequestDescriptionParams;
    [PROMPT_NAMES.USER_REQUEST]: UserRequestParams;
    [PROMPT_NAMES.RECOMMEND_STEPS]: RecommendStepsParams;
    [PROMPT_NAMES.CHECK_PROGRESS]: CheckProgressParams;
    [PROMPT_NAMES.CHECK_COMMENT_LANGUAGE]: CheckCommentLanguageParams;
    [PROMPT_NAMES.TRANSLATE_COMMENT]: CheckCommentLanguageParams;
    [PROMPT_NAMES.CLI_DO]: CliDoParams;
    [PROMPT_NAMES.BUGBOT]: BugbotParams;
    [PROMPT_NAMES.BUGBOT_FIX]: BugbotFixParams;
    [PROMPT_NAMES.BUGBOT_FIX_INTENT]: BugbotFixIntentParams;
};

const registry: Record<PromptName, (params: Record<string, string>) => string> = {
    [PROMPT_NAMES.ANSWER_ISSUE_HELP]: (p) => getAnswerIssueHelpPrompt(p as AnswerIssueHelpParams),
    [PROMPT_NAMES.THINK]: (p) => getThinkPrompt(p as ThinkParams),
    [PROMPT_NAMES.UPDATE_PULL_REQUEST_DESCRIPTION]: (p) =>
        getUpdatePullRequestDescriptionPrompt(p as UpdatePullRequestDescriptionParams),
    [PROMPT_NAMES.USER_REQUEST]: (p) => getUserRequestPrompt(p as UserRequestParams),
    [PROMPT_NAMES.RECOMMEND_STEPS]: (p) => getRecommendStepsPrompt(p as RecommendStepsParams),
    [PROMPT_NAMES.CHECK_PROGRESS]: (p) => getCheckProgressPrompt(p as CheckProgressParams),
    [PROMPT_NAMES.CHECK_COMMENT_LANGUAGE]: (p) =>
        getAdaptCommentLanguagePrompt(p as CheckCommentLanguageParams),
    [PROMPT_NAMES.TRANSLATE_COMMENT]: (p) =>
        getTranslateCommentPrompt(p as CheckCommentLanguageParams),
    [PROMPT_NAMES.CLI_DO]: (p) => getCliDoPrompt(p as CliDoParams),
    [PROMPT_NAMES.BUGBOT]: (p) => getBugbotPrompt(p as BugbotParams),
    [PROMPT_NAMES.BUGBOT_FIX]: (p) => getBugbotFixPrompt(p as BugbotFixParams),
    [PROMPT_NAMES.BUGBOT_FIX_INTENT]: (p) =>
        getBugbotFixIntentPrompt(p as BugbotFixIntentParams),
};

/**
 * Returns a filled prompt by name. Params must match the prompt's expected keys.
 */
export function getPrompt(name: PromptName, params: PromptParamsMap[PromptName]): string {
    const fn = registry[name];
    if (!fn) {
        throw new Error(`Unknown prompt: ${name}`);
    }
    return fn(params as Record<string, string>);
}
