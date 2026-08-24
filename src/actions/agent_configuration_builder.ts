import type { AgentConfiguration, AgentProvider, AgentTaskConfiguration } from '../data/model/agent';
import { defaultCliCommand } from '../data/repository/agent_cli_command_policy';

export interface AgentTaskConfigurationValues {
    provider: string;
    modelProvider?: string;
    model: string;
    command?: string;
}

export interface AgentTasksConfigurationValues extends AgentTaskConfigurationValues {
    findings?: Partial<AgentTaskConfigurationValues>;
    fixer?: Partial<AgentTaskConfigurationValues>;
}

const PROVIDERS: readonly AgentProvider[] = ['opencode', 'cursor', 'codex'];
const DEFAULT_MODEL_PROVIDERS = ['openai', 'opencode', 'openrouter', 'anthropic', 'cursor', 'local'] as const;

function configuredAllowlist(name: string, fallback: readonly string[]): readonly string[] {
    const raw = process.env[name]?.trim();
    if (!raw) return fallback;
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
    const allowedProviders = configuredAllowlist('AGENT_ALLOWED_MODEL_PROVIDERS', DEFAULT_MODEL_PROVIDERS);
    if (!allowedProviders.includes(modelProvider)) throw new Error(`Agent model provider "${modelProvider}" is not allowlisted.`);
    const model = values.model.trim();
    if (!model) throw new Error('Agent model must not be empty.');
    const allowedModels = process.env.AGENT_ALLOWED_MODELS?.split(',').map(value => value.trim()).filter(Boolean);
    if (allowedModels?.length && !allowedModels.includes(`${modelProvider}/${model}`) && !allowedModels.includes(model)) {
        throw new Error(`Agent model "${modelProvider}/${model}" is not allowlisted.`);
    }
    const command = values.command?.trim() || (provider === 'opencode'
        ? `${defaultCliCommand(provider)} --model ${modelProvider}/${model}`
        : defaultCliCommand(provider));
    if (provider === 'opencode' && !command.includes('--model')) throw new Error('OpenCode command must select the model explicitly with --model.');
    return { provider, modelProvider, model, command };
}

function mergeTaskValues(values: AgentTaskConfigurationValues, overrides?: Partial<AgentTaskConfigurationValues>): AgentTaskConfigurationValues {
    return { ...values, ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)) };
}

export function buildAgentTasks(values: AgentTasksConfigurationValues): AgentTaskConfiguration {
    const findings = buildConfiguration(mergeTaskValues(values, values.findings));
    const fixer = buildConfiguration(mergeTaskValues(values, values.fixer));
    return { findings, fixer };
}
