import type { AgentConfiguration, AgentTaskConfiguration } from '../../domain/agent';
export interface AgentTaskConfigurationValues {
    provider: string;
    modelProvider?: string;
    model: string;
    effort?: string;
    command?: string;
}
export declare function buildAgentConfiguration(values: AgentTaskConfigurationValues, environment?: NodeJS.ProcessEnv): AgentConfiguration;
export declare function mergeAgentTaskValues(values: AgentTaskConfigurationValues, overrides?: Partial<AgentTaskConfigurationValues>): AgentTaskConfigurationValues;
export declare function buildAgentTaskConfiguration(values: AgentTaskConfigurationValues & {
    findings?: Partial<AgentTaskConfigurationValues>;
    fixer?: Partial<AgentTaskConfigurationValues>;
}, environment?: NodeJS.ProcessEnv): AgentTaskConfiguration;
