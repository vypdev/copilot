import type { AgentConfiguration, AgentTask, AgentTaskConfiguration } from '../model/agent';

export function isValidAgentConfiguration(configuration: AgentConfiguration): boolean {
    return Boolean(configuration.command?.trim()) && Boolean(configuration.model.trim());
}
export function getValidatedAgentConfiguration(
    configuration: AgentTaskConfiguration[AgentTask],
    task: AgentTask,
): AgentTaskConfiguration[AgentTask] {
    if (!configuration.command?.trim()) {
        throw new Error(`Missing command for ${task} agent.`);
    }
    return configuration;
}
