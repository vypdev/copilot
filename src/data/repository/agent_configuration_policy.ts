import type { AgentConfiguration, AgentTask, AgentTaskConfiguration } from '../model/agent';
import { validateAgentCommand } from '../../application/policies/agent_command_policy';

export function isValidAgentConfiguration(configuration: AgentConfiguration): boolean {
    if (!['opencode', 'codex', 'cursor'].includes(configuration.provider)) return false;
    if (!configuration.model.trim() || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(configuration.model.trim())) return false;
    if (configuration.modelProvider && !/^[a-z0-9][a-z0-9_-]*$/.test(configuration.modelProvider.trim().toLowerCase())) return false;
    if (configuration.effort && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(configuration.effort.trim())) return false;
    try {
        validateAgentCommand(configuration);
        return true;
    } catch {
        return false;
    }
}
export function getValidatedAgentConfiguration(
    configuration: AgentTaskConfiguration[AgentTask],
    task: AgentTask,
): AgentTaskConfiguration[AgentTask] {
    if (!isValidAgentConfiguration(configuration)) throw new Error(`Invalid configuration for ${task} agent.`);
    return configuration;
}
