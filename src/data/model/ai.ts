import { AgentConfiguration, AgentTask, AgentTaskConfiguration } from './agent';
import {
    DEFAULT_PULL_REQUEST_DESCRIPTION_MODE,
    normalizePullRequestDescriptionMode,
    type PullRequestDescriptionMode,
} from '../../domain/pull_request_description';
import {
    DEFAULT_BUGBOT_REVIEW_CONFIGURATION,
    normalizeBugbotReviewConfiguration,
    type BugbotReviewConfiguration,
} from '../../domain/bugbot/review_configuration';

export class Ai {
    private aiMembersOnly: boolean;
    private aiIgnoreFiles: string[];
    private aiIncludeReasoning: boolean;
    private bugbotMinSeverity: string;
    private bugbotCommentLimit: number;
    private bugbotFixVerifyCommands: string[];
    private agentTasks: AgentTaskConfiguration;
    private pullRequestDescriptionMode: PullRequestDescriptionMode;
    private bugbotReviewConfiguration: BugbotReviewConfiguration;

    constructor(
        _configurationSource: string,
        model: string,
        aiMembersOnly: boolean,
        aiIgnoreFiles: string[],
        aiIncludeReasoning: boolean,
        bugbotMinSeverity: string,
        bugbotCommentLimit: number,
        bugbotFixVerifyCommands: string[] = [],
        agentTasks: AgentTaskConfiguration = {
            findings: { provider: 'codex', modelProvider: 'openai', model },
            fixer: { provider: 'codex', modelProvider: 'openai', model },
        },
        pullRequestDescriptionMode: PullRequestDescriptionMode = DEFAULT_PULL_REQUEST_DESCRIPTION_MODE,
        bugbotReviewConfiguration: Partial<BugbotReviewConfiguration> = DEFAULT_BUGBOT_REVIEW_CONFIGURATION,
    ) {
        this.aiMembersOnly = aiMembersOnly;
        this.aiIgnoreFiles = aiIgnoreFiles;
        this.aiIncludeReasoning = aiIncludeReasoning;
        this.bugbotMinSeverity = bugbotMinSeverity;
        this.bugbotCommentLimit = bugbotCommentLimit;
        this.bugbotFixVerifyCommands = bugbotFixVerifyCommands;
        this.agentTasks = agentTasks;
        this.pullRequestDescriptionMode = normalizePullRequestDescriptionMode(pullRequestDescriptionMode);
        this.bugbotReviewConfiguration = normalizeBugbotReviewConfiguration(bugbotReviewConfiguration);
    }

    getPullRequestDescriptionMode(): PullRequestDescriptionMode {
        return this.pullRequestDescriptionMode;
    }

    getAiMembersOnly(): boolean {
        return this.aiMembersOnly;
    }

    getAiIgnoreFiles(): string[] {
        return this.aiIgnoreFiles;
    }

    getAiIncludeReasoning(): boolean {
        return this.aiIncludeReasoning;
    }

    getBugbotMinSeverity(): string {
        return this.bugbotMinSeverity;
    }

    getBugbotCommentLimit(): number {
        return this.bugbotCommentLimit;
    }

    getBugbotFixVerifyCommands(): string[] {
        return this.bugbotFixVerifyCommands;
    }

    getBugbotReviewConfiguration(): BugbotReviewConfiguration {
        return this.bugbotReviewConfiguration;
    }

    /** Applies command-scoped review options and restores the shared configuration afterwards. */
    async withBugbotReviewConfiguration<T>(
        overrides: Partial<BugbotReviewConfiguration>,
        operation: () => Promise<T>,
    ): Promise<T> {
        const previous = this.bugbotReviewConfiguration;
        this.bugbotReviewConfiguration = normalizeBugbotReviewConfiguration({ ...previous, ...overrides });
        try {
            return await operation();
        } finally {
            this.bugbotReviewConfiguration = previous;
        }
    }

    getAgentConfiguration(task: AgentTask): AgentConfiguration {
        return this.agentTasks[task] ?? this.agentTasks.findings;
    }
}
