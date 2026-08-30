import { AgentConfiguration, AgentTask, AgentTaskConfiguration } from './agent';
export declare class Ai {
    private aiPullRequestDescription;
    private aiMembersOnly;
    private aiIgnoreFiles;
    private aiIncludeReasoning;
    private bugbotMinSeverity;
    private bugbotCommentLimit;
    private bugbotFixVerifyCommands;
    private agentTasks;
    constructor(_configurationSource: string, model: string, aiPullRequestDescription: boolean, aiMembersOnly: boolean, aiIgnoreFiles: string[], aiIncludeReasoning: boolean, bugbotMinSeverity: string, bugbotCommentLimit: number, bugbotFixVerifyCommands?: string[], agentTasks?: AgentTaskConfiguration);
    getAiPullRequestDescription(): boolean;
    getAiMembersOnly(): boolean;
    getAiIgnoreFiles(): string[];
    getAiIncludeReasoning(): boolean;
    getBugbotMinSeverity(): string;
    getBugbotCommentLimit(): number;
    getBugbotFixVerifyCommands(): string[];
    getAgentConfiguration(task: AgentTask): AgentConfiguration;
}
