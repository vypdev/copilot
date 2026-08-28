import type { AgentTaskConfiguration } from '../../data/model/agent';
export interface DoAgentOptions {
    agentProvider?: string;
    agentModelProvider?: string;
    agentModel?: string;
    agentEffort?: string;
    agentCommand?: string;
    findingsProvider?: string;
    findingsModelProvider?: string;
    findingsEffort?: string;
    findingsModel?: string;
    findingsCommand?: string;
    fixerProvider?: string;
    fixerModelProvider?: string;
    fixerEffort?: string;
    fixerModel?: string;
    fixerCommand?: string;
}
export declare function buildDoAgentTasks(options: DoAgentOptions): AgentTaskConfiguration;
export declare function formatDoJsonResponse(text: string | undefined, sessionId?: string): string;
