import type { AgentTaskConfiguration } from '../data/model/agent';
export interface GithubActionAiInputs {
    readonly requestedAgentTasks: AgentTaskConfiguration;
    readonly pullRequestDescription: boolean;
    readonly membersOnly: boolean;
    readonly includeReasoning: boolean;
    readonly ignoreFiles: string[];
    readonly bugbotSeverity: string;
    readonly bugbotCommentLimit: number;
    readonly bugbotFixVerifyCommands: string[];
}
export declare function readGithubActionAgentTasks(getInput: (key: string) => string, _configurationSource?: string): AgentTaskConfiguration;
export declare function readGithubActionAiInputs(getInput: (key: string) => string): GithubActionAiInputs;
