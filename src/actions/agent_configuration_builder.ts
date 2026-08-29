import type { AgentTaskConfiguration } from '../domain/agent';
import type { AgentConfigurationEnvironment } from '../application/ports/agent_configuration_ports';
import {
    buildAgentTaskConfiguration,
    type AgentTaskConfigurationValues,
} from '../application/policies/agent_configuration_input_policy';

export type { AgentTaskConfigurationValues };

export interface AgentTasksConfigurationValues extends AgentTaskConfigurationValues {
    findings?: Partial<AgentTaskConfigurationValues>;
    fixer?: Partial<AgentTaskConfigurationValues>;
}

/** Builds the validated findings/fixer pair used by both action lifecycles. */
export function buildAgentTasks(
    values: AgentTasksConfigurationValues,
    environment: AgentConfigurationEnvironment = process.env,
): AgentTaskConfiguration {
    return buildAgentTaskConfiguration(values, environment);
}
