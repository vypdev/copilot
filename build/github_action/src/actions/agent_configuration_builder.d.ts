import type { AgentTaskConfiguration } from '../domain/agent';
import { type AgentTaskConfigurationValues } from '../application/policies/agent_configuration_input_policy';
export type { AgentTaskConfigurationValues };
export interface AgentTasksConfigurationValues extends AgentTaskConfigurationValues {
    findings?: Partial<AgentTaskConfigurationValues>;
    fixer?: Partial<AgentTaskConfigurationValues>;
}
/** Builds the validated findings/fixer pair used by both action lifecycles. */
export declare function buildAgentTasks(values: AgentTasksConfigurationValues): AgentTaskConfiguration;
