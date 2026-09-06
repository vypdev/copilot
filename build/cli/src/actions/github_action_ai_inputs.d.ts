import type { AgentTaskConfiguration } from '../data/model/agent';
import { type PullRequestDescriptionMode } from '../domain/pull_request_description';
import { type BugbotReviewConfiguration } from '../domain/bugbot/review_configuration';
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
export declare function readGithubActionAgentTasks(getInput: (key: string) => string, _configurationSource?: string): AgentTaskConfiguration;
export declare function readGithubActionAiInputs(getInput: (key: string) => string): GithubActionAiInputs;
