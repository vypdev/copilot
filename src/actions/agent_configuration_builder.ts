import type { AgentConfiguration, AgentProvider, AgentTaskConfiguration } from '../data/model/agent';
import { defaultAgentCommand } from '../domain/agent_command';
import { validateAgentCommand } from '../data/repository/agent_cli_command_policy';

export interface AgentTaskConfigurationValues {
    provider: string;
    modelProvider?: string;
    model: string;
    effort?: string;
    command?: string;
}

export interface AgentTasksConfigurationValues extends AgentTaskConfigurationValues {
    findings?: Partial<AgentTaskConfigurationValues>;
    fixer?: Partial<AgentTaskConfigurationValues>;
}

const PROVIDERS: readonly AgentProvider[] = ['opencode', 'cursor', 'codex'];

function configuredAllowlist(name: string): readonly string[] | undefined {
    const raw = process.env[name]?.trim();
    if (!raw) return undefined;
    const values = raw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!values.length) throw new Error(`${name} must contain at least one value.`);
    return values;
}


function resolveProvider(value: string): AgentProvider {
    if (PROVIDERS.includes(value as AgentProvider)) return value as AgentProvider;
    throw new Error(`Unsupported agent provider "${value}". Supported providers: ${PROVIDERS.join(', ')}.`);
}

function buildConfiguration(values: AgentTaskConfigurationValues): AgentConfiguration {
    const provider = resolveProvider(values.provider.trim().toLowerCase());
    const modelProvider = values.modelProvider?.trim().toLowerCase() || 'openai';
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(modelProvider)) throw new Error('Agent model provider must be a valid provider identifier.');
    const allowedProviders = configuredAllowlist('AGENT_ALLOWED_MODEL_PROVIDERS');
    if (allowedProviders && !allowedProviders.includes(modelProvider)) throw new Error(`Agent model provider "${modelProvider}" is not allowlisted.`);
    const model = values.model.trim();
    if (!model) throw new Error('Agent model must not be empty.');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(model)) {
        throw new Error('Agent model must be a simple model identifier without whitespace or shell syntax.');
    }
    const allowedModels = process.env.AGENT_ALLOWED_MODELS?.split(',').map(value => value.trim()).filter(Boolean);
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

function mergeTaskValues(values: AgentTaskConfigurationValues, overrides?: Partial<AgentTaskConfigurationValues>): AgentTaskConfigurationValues {
    return { ...values, ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)) };
}

export function buildAgentTasks(values: AgentTasksConfigurationValues): AgentTaskConfiguration {
    const findings = buildConfiguration(mergeTaskValues(values, values.findings));
    const fixer = buildConfiguration(mergeTaskValues(values, values.fixer));
    return { findings, fixer };
}
