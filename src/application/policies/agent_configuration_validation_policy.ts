import type { AgentProvider } from '../../domain/agent';
import { ApplicationError } from '../errors/application_error';

export const SUPPORTED_AGENT_PROVIDERS: readonly AgentProvider[] = ['opencode', 'cursor', 'codex'];

export function resolveAgentProvider(value: string): AgentProvider {
    if (SUPPORTED_AGENT_PROVIDERS.includes(value as AgentProvider)) return value as AgentProvider;
    throw new ApplicationError('configuration.unsupported', `Unsupported agent provider "${value}". Supported providers: ${SUPPORTED_AGENT_PROVIDERS.join(', ')}.`);
}

export function resolveModelProvider(
    value: string | undefined,
    environment: Record<string, string | undefined>,
    agentProvider?: AgentProvider,
): string {
    const provider = value?.trim().toLowerCase() || (agentProvider === 'cursor' ? 'cursor' : 'openai');
    assertIdentifier(provider, 'Agent model provider must be a valid provider identifier.');
    assertAllowlisted('AGENT_ALLOWED_MODEL_PROVIDERS', provider, environment);
    return provider;
}

export function assertProviderModelCompatibility(agentProvider: AgentProvider, modelProvider: string): void {
    if (agentProvider === 'codex' && modelProvider !== 'openai') {
        throw new ApplicationError(
            'configuration.unsupported',
            `Codex automation supports the "openai" model provider only; received "${modelProvider}".`,
        );
    }
    if (agentProvider === 'cursor' && modelProvider !== 'cursor') {
        throw new ApplicationError(
            'configuration.unsupported',
            `Cursor automation requires model provider "cursor"; received "${modelProvider}".`,
        );
    }
}

export function resolveModel(value: string): string {
    const model = value.trim();
    if (!model) throw new ApplicationError('configuration.invalid', 'Agent model must not be empty.');
    assertIdentifier(model, 'Agent model must be a simple model identifier without whitespace or shell syntax.', /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
    return model;
}

export function resolveEffort(value: string | undefined): string | undefined {
    const effort = value?.trim() || undefined;
    if (effort) assertIdentifier(effort, 'Agent effort must be a simple identifier without whitespace or shell syntax.');
    return effort;
}

export function assertModelAllowlisted(modelProvider: string, model: string, environment: Record<string, string | undefined>): void {
    const allowedModels = parseAllowlist(environment.AGENT_ALLOWED_MODELS);
    if (allowedModels.length > 0 && !allowedModels.includes(`${modelProvider}/${model}`) && !allowedModels.includes(model)) {
        throw new ApplicationError('authorization.denied', `Agent model "${modelProvider}/${model}" is not allowlisted.`);
    }
}

function assertAllowlisted(name: string, value: string, environment: Record<string, string | undefined>): void {
    const values = parseAllowlist(environment[name]);
    if (values.length > 0 && !values.includes(value)) throw new ApplicationError('authorization.denied', `Agent model provider "${value}" is not allowlisted.`);
}

function parseAllowlist(raw: string | undefined): string[] {
    if (!raw?.trim()) return [];
    const values = raw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (values.length === 0) throw new ApplicationError('configuration.invalid', 'Agent allowlist must contain at least one value.');
    return values;
}

function assertIdentifier(value: string, message: string, pattern = /^[a-z0-9][a-z0-9_-]*$/i): void {
    if (!pattern.test(value)) throw new ApplicationError('configuration.invalid', message);
}
