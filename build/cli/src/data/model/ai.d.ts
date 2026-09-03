import { AgentConfiguration, AgentTask, AgentTaskConfiguration } from './agent';
import { type PullRequestDescriptionMode } from '../../domain/pull_request_description';
export declare class Ai {
    private aiPullRequestDescription;
    private aiMembersOnly;
    private aiIgnoreFiles;
    private aiIncludeReasoning;
    private bugbotMinSeverity;
    private bugbotCommentLimit;
    private bugbotFixVerifyCommands;
    private agentTasks;
    private pullRequestDescriptionMode;
    constructor(_configurationSource: string, model: string, aiPullRequestDescription: boolean, aiMembersOnly: boolean, aiIgnoreFiles: string[], aiIncludeReasoning: boolean, bugbotMinSeverity: string, bugbotCommentLimit: number, bugbotFixVerifyCommands?: string[], agentTasks?: AgentTaskConfiguration, pullRequestDescriptionMode?: PullRequestDescriptionMode);
    getAiPullRequestDescription(): boolean;
    getPullRequestDescriptionMode(): PullRequestDescriptionMode;
    getAiMembersOnly(): boolean;
    getAiIgnoreFiles(): string[];
    getAiIncludeReasoning(): boolean;
    getBugbotMinSeverity(): string;
    getBugbotCommentLimit(): number;
    getBugbotFixVerifyCommands(): string[];
    getAgentConfiguration(task: AgentTask): AgentConfiguration;
}
