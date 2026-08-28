import type { AgentTaskConfiguration } from '../data/model/agent';
export interface AgentTaskConfigurationValues {
    provider: string;
    modelProvider?: string;
    model: string;
    effort?: string;
    command?: string;
}
export interface AgentTasksConfigurationValues extends AgentTaskConfigurationValues {
    findings?: Partial<AgentTaskConfigurationValues>;
    fixer?: Partial<AgentTaskConfigurationValues>;
}
export declare function buildAgentTasks(values: AgentTasksConfigurationValues): AgentTaskConfiguration;
