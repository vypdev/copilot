import type { AgentConfiguration, AgentTask, AgentTaskConfiguration } from '../model/agent';
import { validateAgentCommand } from '../../application/policies/agent_command_policy';

const SUPPORTED_PROVIDERS = new Set(['opencode', 'codex', 'cursor']);
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const MODEL_PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidAgentConfiguration(configuration: AgentConfiguration): boolean {
    if (!SUPPORTED_PROVIDERS.has(configuration.provider)) return false;
    if (!hasRequiredValue(configuration.model, MODEL_PATTERN)) return false;
    if (!hasOptionalValue(configuration.modelProvider, MODEL_PROVIDER_PATTERN)) return false;
    if (!hasOptionalValue(configuration.effort, MODEL_PATTERN)) return false;
    try {
        validateAgentCommand(configuration);
        return true;
    } catch {
        return false;
    }
}

function hasRequiredValue(value: string, pattern: RegExp): boolean {
    return value.trim().length > 0 && pattern.test(value.trim());
}

function hasOptionalValue(value: string | undefined, pattern: RegExp): boolean {
    return value === undefined || value.trim().length === 0 || pattern.test(value.trim().toLowerCase());
}
export function getValidatedAgentConfiguration(
    configuration: AgentTaskConfiguration[AgentTask],
    task: AgentTask,
): AgentTaskConfiguration[AgentTask] {
    if (!isValidAgentConfiguration(configuration)) throw new Error(`Invalid configuration for ${task} agent.`);
    return configuration;
}
