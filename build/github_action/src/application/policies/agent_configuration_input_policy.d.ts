import type { AgentConfiguration, AgentTaskConfiguration } from '../../domain/agent';
import type { AgentConfigurationEnvironment } from '../ports/agent_configuration_ports';
export interface AgentTaskConfigurationValues {
    provider: string;
    modelProvider?: string;
    model: string;
    effort?: string;
    command?: string;
}
export declare function buildAgentConfiguration(values: AgentTaskConfigurationValues, environment: AgentConfigurationEnvironment): AgentConfiguration;
export declare function mergeAgentTaskValues(values: AgentTaskConfigurationValues, overrides?: Partial<AgentTaskConfigurationValues>): AgentTaskConfigurationValues;
export declare function buildAgentTaskConfiguration(values: AgentTaskConfigurationValues & {
    findings?: Partial<AgentTaskConfigurationValues>;
    fixer?: Partial<AgentTaskConfigurationValues>;
}, environment: AgentConfigurationEnvironment): AgentTaskConfiguration;
