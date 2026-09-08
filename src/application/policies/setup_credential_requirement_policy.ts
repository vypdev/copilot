import type {
    SetupAgentRoleConfiguration,
    SetupConfiguration,
    SetupCredentialRequirement,
} from '../../domain/setup';
import { setupAgentTasksForFeatures } from './setup_configuration_defaults';

const SECRET_BY_MODEL_PROVIDER: Readonly<Record<string, string>> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
};
const LOCAL_MODEL_PROVIDERS = ['local', 'ollama', 'lmstudio'];

/** Builds the non-sensitive credential contract implied by the enabled workflows. */
export function buildSetupCredentialRequirements(configuration: SetupConfiguration): SetupCredentialRequirement[] {
    const requirements = new CredentialRequirementCollection();
    requirements.add({
        name: 'PAT',
        kind: 'workflowPat',
        description: 'A separate GitHub token owned by the bot account. It is used by workflows at runtime.',
    });
    for (const task of setupAgentTasksForFeatures(configuration)) {
        addAgentCredentialRequirements(requirements, configuration.agents[task]);
    }
    return requirements.values();
}

function addAgentCredentialRequirements(
    requirements: CredentialRequirementCollection,
    agent: SetupAgentRoleConfiguration,
): void {
    const modelProvider = agent.modelProvider.trim().toLowerCase();
    const alternativeGroup = `agent:${agent.provider}:${modelProvider || 'default'}`;
    const providerCredential = credentialForModelProvider(modelProvider);

    if (agent.provider === 'cursor') {
        requirements.add({
            name: 'CURSOR_API_KEY',
            kind: 'apiKey',
            description: 'Cursor API key used by the Cursor agent runtime.',
            provider: 'cursor',
            model: agent.model,
        });
        return;
    }
    if (agent.provider === 'opencode' && !LOCAL_MODEL_PROVIDERS.includes(modelProvider)) {
        requirements.add({
            name: 'OPENCODE_API_KEY',
            kind: 'apiKey',
            description: 'OpenCode API key used by the OpenCode agent runtime.',
            provider: 'opencode',
            model: agent.model,
            alternativeGroup,
        });
    }
    if (agent.provider === 'codex') addCodexCredentials(requirements, agent, alternativeGroup);
    if (providerCredential) addModelProviderCredential(requirements, agent, modelProvider, providerCredential, alternativeGroup);
}

function addCodexCredentials(
    requirements: CredentialRequirementCollection,
    agent: SetupAgentRoleConfiguration,
    alternativeGroup: string,
): void {
    for (const [name, description] of [
        ['CODEX_API_KEY', 'Optional Codex API-key fallback when the target runner has no authenticated Codex session.'],
        ['CODEX_ACCESS_TOKEN', 'Optional Codex access-token fallback when the target runner has no authenticated Codex session.'],
    ] as const) {
        requirements.add({
            name,
            kind: 'apiKey',
            description,
            provider: 'codex',
            model: agent.model,
            alternativeGroup,
            runnerAuthenticationGroup: alternativeGroup,
        });
    }
}

function addModelProviderCredential(
    requirements: CredentialRequirementCollection,
    agent: SetupAgentRoleConfiguration,
    modelProvider: string,
    name: string,
    alternativeGroup: string,
): void {
    requirements.add({
        name,
        kind: 'apiKey',
        description: `${modelProvider} API key for ${agent.model}.`,
        provider: modelProvider,
        model: agent.model,
        alternativeGroup,
        validation: SECRET_BY_MODEL_PROVIDER[modelProvider] ? 'metadata' : 'unverifiable',
        runnerAuthenticationGroup: agent.provider === 'codex' ? alternativeGroup : undefined,
    });
}

function credentialForModelProvider(modelProvider: string): string | undefined {
    if (!modelProvider || LOCAL_MODEL_PROVIDERS.includes(modelProvider)) return undefined;
    return SECRET_BY_MODEL_PROVIDER[modelProvider] ?? `${modelProvider.replace(/-/g, '_').toUpperCase()}_API_KEY`;
}

interface CredentialRequirementInput extends Omit<SetupCredentialRequirement, 'alternativeGroups' | 'runnerAuthenticationGroups'> {
    readonly alternativeGroup?: string;
    readonly runnerAuthenticationGroup?: string;
}

class CredentialRequirementCollection {
    private readonly requirements = new Map<string, SetupCredentialRequirement>();

    add(input: CredentialRequirementInput): void {
        const { alternativeGroup, runnerAuthenticationGroup, validation, ...requirement } = input;
        const existing = this.requirements.get(input.name);
        const alternativeGroups = uniqueDefined(existing?.alternativeGroups, alternativeGroup);
        const runnerAuthenticationGroups = uniqueDefined(existing?.runnerAuthenticationGroups, runnerAuthenticationGroup);
        const isUnverifiable = existing?.validation === 'unverifiable' || validation === 'unverifiable';
        this.requirements.set(input.name, {
            ...existing,
            ...requirement,
            alternativeGroups,
            runnerAuthenticationGroups,
            ...(isUnverifiable ? { validation: 'unverifiable' } : {}),
        });
    }

    values(): SetupCredentialRequirement[] {
        return [...this.requirements.values()];
    }
}

function uniqueDefined(current: readonly string[] | undefined, next: string | undefined): string[] | undefined {
    const values = new Set([...(current ?? []), ...(next ? [next] : [])]);
    return values.size > 0 ? [...values] : undefined;
}
