import type { AgentConfiguration, AgentProvider, AgentTaskConfiguration } from '../../domain/agent';
import { defaultAgentCommand } from '../../domain/agent_command';
import { validateAgentCommand } from './agent_command_policy';

const SUPPORTED_PROVIDERS: readonly AgentProvider[] = ['opencode', 'cursor', 'codex'];

function configuredAllowlist(name: string, environment: NodeJS.ProcessEnv): readonly string[] | undefined {
    const raw = environment[name]?.trim();
    if (!raw) return undefined;
    const values = raw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!values.length) throw new Error(`${name} must contain at least one value.`);
    return values;
}

function resolveProvider(value: string): AgentProvider {
    if (SUPPORTED_PROVIDERS.includes(value as AgentProvider)) return value as AgentProvider;
    throw new Error(`Unsupported agent provider "${value}". Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}.`);
}

export interface AgentTaskConfigurationValues {
    provider: string;
    modelProvider?: string;
    model: string;
    effort?: string;
    command?: string;
}

export function buildAgentConfiguration(
    values: AgentTaskConfigurationValues,
    environment: NodeJS.ProcessEnv = process.env,
): AgentConfiguration {
    const provider = resolveProvider(values.provider.trim().toLowerCase());
    const modelProvider = values.modelProvider?.trim().toLowerCase() || 'openai';
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(modelProvider)) throw new Error('Agent model provider must be a valid provider identifier.');
    const allowedProviders = configuredAllowlist('AGENT_ALLOWED_MODEL_PROVIDERS', environment);
    if (allowedProviders && !allowedProviders.includes(modelProvider)) throw new Error(`Agent model provider "${modelProvider}" is not allowlisted.`);

    const model = values.model.trim();
    if (!model) throw new Error('Agent model must not be empty.');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(model)) {
        throw new Error('Agent model must be a simple model identifier without whitespace or shell syntax.');
    }
    const allowedModels = environment.AGENT_ALLOWED_MODELS?.split(',').map(value => value.trim()).filter(Boolean);
    if (allowedModels?.length && !allowedModels.includes(`${modelProvider}/${model}`) && !allowedModels.includes(model)) {
        throw new Error(`Agent model "${modelProvider}/${model}" is not allowlisted.`);
    }

    const effort = values.effort?.trim() || undefined;
    if (effort && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(effort)) {
        throw new Error('Agent effort must be a simple identifier without whitespace or shell syntax.');
    }
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
    environment: NodeJS.ProcessEnv = process.env,
): AgentTaskConfiguration {
    return {
        findings: buildAgentConfiguration(mergeAgentTaskValues(values, values.findings), environment),
        fixer: buildAgentConfiguration(mergeAgentTaskValues(values, values.fixer), environment),
    };
}
