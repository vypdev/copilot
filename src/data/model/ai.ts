import { AgentTask, AgentTaskConfiguration } from './agent';
import { defaultAgentCommand } from '../../domain/agent_command';

export class Ai {
    private aiPullRequestDescription: boolean;
    private aiMembersOnly: boolean;
    private aiIgnoreFiles: string[];
    private aiIncludeReasoning: boolean;
    private bugbotMinSeverity: string;
    private bugbotCommentLimit: number;
    private bugbotFixVerifyCommands: string[];
    private agentTasks: AgentTaskConfiguration;

    constructor(
        _configurationSource: string,
        model: string,
        aiPullRequestDescription: boolean,
        aiMembersOnly: boolean,
        aiIgnoreFiles: string[],
        aiIncludeReasoning: boolean,
        bugbotMinSeverity: string,
        bugbotCommentLimit: number,
        bugbotFixVerifyCommands: string[] = [],
        agentTasks: AgentTaskConfiguration = {
            findings: { provider: 'codex', modelProvider: 'openai', model, command: defaultAgentCommand({ provider: 'codex', modelProvider: 'openai', model }) },
            fixer: { provider: 'codex', modelProvider: 'openai', model, command: defaultAgentCommand({ provider: 'codex', modelProvider: 'openai', model }) },
        }
    ) {
        this.aiPullRequestDescription = aiPullRequestDescription;
        this.aiMembersOnly = aiMembersOnly;
        this.aiIgnoreFiles = aiIgnoreFiles;
        this.aiIncludeReasoning = aiIncludeReasoning;
        this.bugbotMinSeverity = bugbotMinSeverity;
        this.bugbotCommentLimit = bugbotCommentLimit;
        this.bugbotFixVerifyCommands = bugbotFixVerifyCommands;
        this.agentTasks = agentTasks;
    }

    getAiPullRequestDescription(): boolean {
        return this.aiPullRequestDescription;
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

    getAgentConfiguration(task: AgentTask): AgentTaskConfiguration[AgentTask] {
        return this.agentTasks[task];
    }
}
