import type { AgentConfiguration, AgentProvider } from '../model/agent';

export const COMMON_OPENCODE_CREDENTIALS = [
    'OPENCODE_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY',
    'MISTRAL_API_KEY',
    'GROQ_API_KEY',
    'DEEPSEEK_API_KEY',
    'XAI_API_KEY',
    'TOGETHERAI_API_KEY',
    'FIREWORKS_API_KEY',
    'PERPLEXITY_API_KEY',
    'CEREBRAS_API_KEY',
    'COHERE_API_KEY',
    'AZURE_OPENAI_API_KEY',
] as const;

const MODEL_PROVIDER_CREDENTIALS: Readonly<Record<string, readonly string[]>> = {
    opencode: ['OPENCODE_API_KEY'],
    openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    google: ['GOOGLE_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    mistral: ['MISTRAL_API_KEY'],
    groq: ['GROQ_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
    xai: ['XAI_API_KEY'],
    togetherai: ['TOGETHERAI_API_KEY'],
    fireworks: ['FIREWORKS_API_KEY'],
    perplexity: ['PERPLEXITY_API_KEY'],
    cerebras: ['CEREBRAS_API_KEY'],
    cohere: ['COHERE_API_KEY'],
    zai: ['ZAI_API_KEY'],
    moonshot: ['MOONSHOT_API_KEY'],
    minimax: ['MINIMAX_API_KEY'],
    cursor: ['CURSOR_API_KEY'],
};

const CLI_CREDENTIALS: Readonly<Record<AgentProvider, readonly string[]>> = {
    opencode: ['OPENCODE_API_KEY'],
    cursor: ['CURSOR_API_KEY'],
    codex: ['CODEX_ACCESS_TOKEN', 'OPENAI_API_KEY'],
};

const KNOWN_AGENT_CREDENTIALS = [...new Set([
    ...COMMON_OPENCODE_CREDENTIALS,
    ...Object.values(MODEL_PROVIDER_CREDENTIALS).flat(),
    ...CLI_CREDENTIALS.codex,
])];

/** Matches credential-shaped variables, including custom OpenCode providers. */
const AGENT_CREDENTIAL_VARIABLE_PATTERN = /(?:API[_-]?KEY|API[_-]?TOKEN|ACCESS[_-]?TOKEN|REFRESH[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|SECRET[_-]?KEY)$/i;

export function isAgentCredentialVariable(variable: string): boolean {
    return AGENT_CREDENTIAL_VARIABLE_PATTERN.test(variable);
}

export function hasValue(environment: NodeJS.ProcessEnv, variable: string): boolean {
    return Boolean(environment[variable]?.trim());
}

export function isLocalModelProvider(modelProvider: string | undefined): boolean {
    return Boolean(modelProvider && ['local', 'ollama', 'lmstudio'].includes(modelProvider));
}

export function hasKnownModelProvider(modelProvider: string | undefined): boolean {
    return !modelProvider
        || isLocalModelProvider(modelProvider)
        || Object.prototype.hasOwnProperty.call(MODEL_PROVIDER_CREDENTIALS, modelProvider);
}

function selectedModelProviderCredential(modelProvider: string | undefined): string | undefined {
    const normalized = modelProvider?.trim().toLowerCase();
    if (!normalized || isLocalModelProvider(normalized)) return undefined;
    return MODEL_PROVIDER_CREDENTIALS[normalized]?.[0]
        ?? `${normalized.replace(/-/g, '_').toUpperCase()}_API_KEY`;
}

export function allowedCredentialVariables(
    provider: AgentProvider | undefined,
    modelProvider?: string,
): readonly string[] {
    const selected = selectedModelProviderCredential(modelProvider);
    if (provider === 'cursor') return CLI_CREDENTIALS.cursor;
    if (provider === 'codex') {
        return uniqueCredentials([...CLI_CREDENTIALS.codex, ...(selected ? [selected] : [])]);
    }
    return modelProvider?.trim()
        ? uniqueCredentials([...CLI_CREDENTIALS.opencode, ...(selected ? [selected] : [])])
        : uniqueCredentials([...CLI_CREDENTIALS.opencode, ...COMMON_OPENCODE_CREDENTIALS]);
}

export function credentialVariables(configuration: AgentConfiguration): readonly string[] {
    if (configuration.provider === 'cursor') return CLI_CREDENTIALS.cursor;
    if (configuration.provider === 'codex') {
        return uniqueCredentials([
            ...CLI_CREDENTIALS.codex,
            ...(selectedModelProviderCredential(configuration.modelProvider)
                ? [selectedModelProviderCredential(configuration.modelProvider)!]
                : []),
        ]);
    }

    const modelProvider = configuration.modelProvider?.trim().toLowerCase();
    if (isLocalModelProvider(modelProvider)) return [];
    const selected = modelProvider
        ? MODEL_PROVIDER_CREDENTIALS[modelProvider] ?? [`${modelProvider.replace(/-/g, '_').toUpperCase()}_API_KEY`]
        : COMMON_OPENCODE_CREDENTIALS;
    return uniqueCredentials([...selected, ...CLI_CREDENTIALS.opencode]);
}

export function removeAgentCredentials(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const isolatedEnvironment = { ...environment };
    for (const variable of Object.keys(isolatedEnvironment)) {
        if (KNOWN_AGENT_CREDENTIALS.includes(variable) || isAgentCredentialVariable(variable)) {
            delete isolatedEnvironment[variable];
        }
    }
    return isolatedEnvironment;
}

/**
 * Runtime variables that an agent CLI may need to start. Everything else is
 * denied by default: GitHub Action inputs, repository tokens, cloud
 * credentials and application secrets must never be inherited implicitly.
 */
const SAFE_AGENT_RUNTIME_VARIABLES = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LANGUAGE',
    'LC_ALL',
    'TERM',
    'COLORTERM',
    'NO_COLOR',
    'FORCE_COLOR',
    'CI',
    'CODEX_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_CACHE_HOME',
    'OPENCODE_DATA_DIR',
    'OPENCODE_AUTH_FILE',
] as const;

export function selectSafeAgentRuntimeEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return Object.fromEntries(SAFE_AGENT_RUNTIME_VARIABLES.flatMap((variable) => (
        environment[variable] === undefined ? [] : [[variable, environment[variable]]]
    )));
}

export function containsCredentialMaterial(value: unknown, propertyName = ''): boolean {
    if (typeof value === 'string') {
        return Boolean(propertyName.match(/(?:api[_-]?key|access|refresh|token|secret)/i) && value.trim());
    }
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, nested]) => containsCredentialMaterial(nested, key));
}

function uniqueCredentials(credentials: readonly string[]): readonly string[] {
    return [...new Set(credentials)];
}
