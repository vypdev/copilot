import type { AgentConfiguration, AgentTaskConfiguration } from '../../domain/agent';
import type { AgentConfigurationEnvironment } from '../ports/agent_configuration_ports';
import {
    assertModelAllowlisted,
    assertProviderModelCompatibility,
    resolveAgentProvider,
    resolveEffort,
    resolveModel,
    resolveModelProvider,
} from './agent_configuration_validation_policy';
import { validateAgentExecutableSelection } from './agent_executable_policy';

export interface AgentTaskConfigurationValues {
    provider: string;
    modelProvider?: string;
    model: string;
    effort?: string;
    executable?: string;
}

export function buildAgentConfiguration(
    values: AgentTaskConfigurationValues,
    environment: AgentConfigurationEnvironment,
): AgentConfiguration {
    const provider = resolveAgentProvider(values.provider.trim().toLowerCase());
    const modelProvider = resolveModelProvider(values.modelProvider, environment, provider);
    assertProviderModelCompatibility(provider, modelProvider);
    const model = resolveModel(values.model);
    assertModelAllowlisted(modelProvider, model, environment);
    const effort = resolveEffort(values.effort);
    const executable = values.executable?.trim();
    const configuration = {
        provider,
        modelProvider,
        model,
        ...(effort ? { effort } : {}),
        ...(executable ? { executable } : {}),
    } satisfies AgentConfiguration;
    validateAgentExecutableSelection(configuration);
    return configuration;
}

export function mergeAgentTaskValues(
    values: AgentTaskConfigurationValues,
    overrides?: Partial<AgentTaskConfigurationValues>,
): AgentTaskConfigurationValues {
    const merged = {
        ...values,
        ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)),
    };
    if (overrides?.provider?.trim() && !overrides.modelProvider?.trim()) {
        delete merged.modelProvider;
    }
    return merged;
}

export function buildAgentTaskConfiguration(
    values: AgentTaskConfigurationValues & {
        findings?: Partial<AgentTaskConfigurationValues>;
        fixer?: Partial<AgentTaskConfigurationValues>;
        planner?: Partial<AgentTaskConfigurationValues>;
        reviewer?: Partial<AgentTaskConfigurationValues>;
        tester?: Partial<AgentTaskConfigurationValues>;
    },
    environment: AgentConfigurationEnvironment,
): AgentTaskConfiguration {
    const configuration: AgentTaskConfiguration = {
        findings: buildAgentConfiguration(mergeAgentTaskValues(values, values.findings), environment),
        fixer: buildAgentConfiguration(mergeAgentTaskValues(values, values.fixer), environment),
    };
    for (const task of ['planner', 'reviewer', 'tester'] as const) {
        if (hasTaskOverride(values[task])) {
            configuration[task] = buildAgentConfiguration(mergeAgentTaskValues(values, values[task]), environment);
        }
    }
    return configuration;
}

function hasTaskOverride(value: Partial<AgentTaskConfigurationValues> | undefined): boolean {
    return Object.values(value ?? {}).some(item => typeof item === 'string' && item.trim().length > 0);
}
