import type { AgentConfiguration, AgentTaskConfiguration } from '../../domain/agent';
import { defaultAgentCommand } from '../../domain/agent_command';
import { validateAgentCommand } from './agent_command_policy';
import type { AgentConfigurationEnvironment } from '../ports/agent_configuration_ports';
import {
    assertModelAllowlisted,
    resolveAgentProvider,
    resolveEffort,
    resolveModel,
    resolveModelProvider,
} from './agent_configuration_validation_policy';

export interface AgentTaskConfigurationValues {
    provider: string;
    modelProvider?: string;
    model: string;
    effort?: string;
    command?: string;
}

export function buildAgentConfiguration(
    values: AgentTaskConfigurationValues,
    environment: AgentConfigurationEnvironment,
): AgentConfiguration {
    const provider = resolveAgentProvider(values.provider.trim().toLowerCase());
    const modelProvider = resolveModelProvider(values.modelProvider, environment);
    const model = resolveModel(values.model);
    assertModelAllowlisted(modelProvider, model, environment);
    const effort = resolveEffort(values.effort);
    const customCommand = values.command?.trim();
    const configuration = {
        provider,
        modelProvider,
        model,
        ...(effort ? { effort } : {}),
        command: customCommand || defaultAgentCommand({ provider, modelProvider, model, effort }),
    } satisfies AgentConfiguration;
    if (customCommand) validateAgentCommand(configuration);
    return configuration;
}

export function mergeAgentTaskValues(
    values: AgentTaskConfigurationValues,
    overrides?: Partial<AgentTaskConfigurationValues>,
): AgentTaskConfigurationValues {
    return {
        ...values,
        ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)),
    };
}

export function buildAgentTaskConfiguration(
    values: AgentTaskConfigurationValues & { findings?: Partial<AgentTaskConfigurationValues>; fixer?: Partial<AgentTaskConfigurationValues> },
    environment: AgentConfigurationEnvironment,
): AgentTaskConfiguration {
    return {
        findings: buildAgentConfiguration(mergeAgentTaskValues(values, values.findings), environment),
        fixer: buildAgentConfiguration(mergeAgentTaskValues(values, values.fixer), environment),
    };
}
