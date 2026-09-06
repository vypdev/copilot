import { AgentConfiguration, AgentTask, AgentTaskConfiguration } from './agent';
import { type PullRequestDescriptionMode } from '../../domain/pull_request_description';
import { type BugbotReviewConfiguration } from '../../domain/bugbot/review_configuration';
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
    private bugbotReviewConfiguration;
    constructor(_configurationSource: string, model: string, aiPullRequestDescription: boolean, aiMembersOnly: boolean, aiIgnoreFiles: string[], aiIncludeReasoning: boolean, bugbotMinSeverity: string, bugbotCommentLimit: number, bugbotFixVerifyCommands?: string[], agentTasks?: AgentTaskConfiguration, pullRequestDescriptionMode?: PullRequestDescriptionMode, bugbotReviewConfiguration?: Partial<BugbotReviewConfiguration>);
    getAiPullRequestDescription(): boolean;
    getPullRequestDescriptionMode(): PullRequestDescriptionMode;
    getAiMembersOnly(): boolean;
    getAiIgnoreFiles(): string[];
    getAiIncludeReasoning(): boolean;
    getBugbotMinSeverity(): string;
    getBugbotCommentLimit(): number;
    getBugbotFixVerifyCommands(): string[];
    getBugbotReviewConfiguration(): BugbotReviewConfiguration;
    /** Applies command-scoped review options and restores the shared configuration afterwards. */
    withBugbotReviewConfiguration<T>(overrides: Partial<BugbotReviewConfiguration>, operation: () => Promise<T>): Promise<T>;
    getAgentConfiguration(task: AgentTask): AgentConfiguration;
}
