import type { AgentConfiguration, AgentProvider, AgentTaskConfiguration, AgentTransport } from '../data/model/agent';
import { defaultCliCommand } from '../data/repository/agent_cli_command_policy';

export interface AgentTaskConfigurationValues {
    provider: string;
    transport: string;
    model: string;
    serverUrl?: string;
    command?: string;
}

export interface AgentTasksConfigurationValues extends AgentTaskConfigurationValues {
    findings?: Partial<AgentTaskConfigurationValues>;
    fixer?: Partial<AgentTaskConfigurationValues>;
}

const PROVIDERS: readonly AgentProvider[] = ['opencode', 'cursor', 'codex'];
const TRANSPORTS: readonly AgentTransport[] = ['server', 'cli'];

function resolveProvider(value: string): AgentProvider {
    if (PROVIDERS.includes(value as AgentProvider)) return value as AgentProvider;
    throw new Error(`Unsupported agent provider "${value}". Supported providers: ${PROVIDERS.join(', ')}.`);
}

function resolveTransport(value: string): AgentTransport {
    if (TRANSPORTS.includes(value as AgentTransport)) return value as AgentTransport;
    throw new Error(`Unsupported agent transport "${value}". Supported transports: ${TRANSPORTS.join(', ')}.`);
}

function buildConfiguration(values: AgentTaskConfigurationValues): AgentConfiguration {
    const provider = resolveProvider(values.provider.trim().toLowerCase());
    const transport = resolveTransport(values.transport.trim().toLowerCase());
    const model = values.model.trim();
    if (!model) throw new Error('Agent model must not be empty.');
    const serverUrl = values.serverUrl?.trim();
    const command = values.command?.trim() || defaultCliCommand(provider);
    if (transport === 'server' && provider !== 'opencode') {
        throw new Error(`Agent server transport is only supported by opencode. Use cli for ${provider}.`);
    }
    if (transport === 'server' && !serverUrl) throw new Error('Agent server transport requires a server URL.');
    return { provider, transport, model, ...(serverUrl ? { serverUrl } : {}), ...(transport === 'cli' ? { command } : {}) };
}

function mergeTaskValues(values: AgentTaskConfigurationValues, overrides?: Partial<AgentTaskConfigurationValues>): AgentTaskConfigurationValues {
    return { ...values, ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)) };
}

export function buildAgentTasks(values: AgentTasksConfigurationValues): AgentTaskConfiguration {
    const findings = buildConfiguration(mergeTaskValues(values, values.findings));
    const fixer = buildConfiguration(mergeTaskValues(values, values.fixer));
    return { findings, fixer };
}
