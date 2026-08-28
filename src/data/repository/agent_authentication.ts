import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentConfiguration } from '../model/agent';

export type AgentCredentialStatus = 'available' | 'missing' | 'not_required';

export interface AgentAuthenticationCheck {
    status: AgentCredentialStatus;
    variables: readonly string[];
    message: string;
}

const COMMON_OPENCODE_CREDENTIALS = [
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

const CLI_CREDENTIALS: Readonly<Record<AgentConfiguration['provider'], readonly string[]>> = {
    opencode: ['OPENCODE_API_KEY'],
    cursor: ['CURSOR_API_KEY'],
    codex: ['CODEX_ACCESS_TOKEN', 'OPENAI_API_KEY'],
};

function hasValue(environment: NodeJS.ProcessEnv, variable: string): boolean {
    return Boolean(environment[variable]?.trim());
}

function hasCodexChatGptSession(environment: NodeJS.ProcessEnv): boolean {
    const codexHome = environment.CODEX_HOME?.trim()
        || (environment === process.env || environment.HOME ? join(environment.HOME || homedir(), '.codex') : undefined);
    if (!codexHome) return false;
    const authPath = join(codexHome, 'auth.json');
    if (!existsSync(authPath)) return false;
    try {
        const auth = JSON.parse(readFileSync(authPath, 'utf8')) as {
            auth_mode?: unknown;
            OPENAI_API_KEY?: unknown;
            tokens?: { access_token?: unknown; refresh_token?: unknown };
        };
        return auth.auth_mode === 'chatgpt'
            && auth.OPENAI_API_KEY == null
            && typeof auth.tokens?.access_token === 'string'
            && typeof auth.tokens?.refresh_token === 'string';
    } catch {
        return false;
    }
}

function hasOpenCodeLocalSession(environment: NodeJS.ProcessEnv): boolean {
    const dataDirectory = environment.OPENCODE_DATA_DIR?.trim()
        || environment.XDG_DATA_HOME?.trim()
        || (environment === process.env || environment.HOME ? join(environment.HOME || homedir(), '.local', 'share') : undefined);
    if (!dataDirectory) return false;
    const authPath = environment.OPENCODE_AUTH_FILE?.trim() || join(dataDirectory, 'opencode', 'auth.json');
    if (!existsSync(authPath)) return false;

    try {
        const auth = JSON.parse(readFileSync(authPath, 'utf8')) as unknown;
        return containsCredentialMaterial(auth);
    } catch {
        return false;
    }
}

function containsCredentialMaterial(value: unknown, propertyName = ''): boolean {
    if (typeof value === 'string') {
        return Boolean(propertyName.match(/(?:api[_-]?key|access|refresh|token|secret)/i) && value.trim());
    }
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, nested]) => containsCredentialMaterial(nested, key));
}

function credentialVariables(configuration: AgentConfiguration): readonly string[] {
    if (configuration.provider === 'cursor') return CLI_CREDENTIALS.cursor;
    if (configuration.provider === 'codex') {
        const modelProvider = configuration.modelProvider?.trim().toLowerCase();
        return [...new Set([
            ...CLI_CREDENTIALS.codex,
            ...(modelProvider ? MODEL_PROVIDER_CREDENTIALS[modelProvider] ?? [`${modelProvider.replace(/-/g, '_').toUpperCase()}_API_KEY`] : []),
        ])];
    }

    const modelProvider = configuration.modelProvider?.trim().toLowerCase();
    if (modelProvider === 'local' || modelProvider === 'ollama' || modelProvider === 'lmstudio') {
        return [];
    }
    const selectedProviderCredentials = modelProvider
        ? MODEL_PROVIDER_CREDENTIALS[modelProvider] ?? [`${modelProvider.replace(/-/g, '_').toUpperCase()}_API_KEY`]
        : COMMON_OPENCODE_CREDENTIALS;
    return [...new Set([...selectedProviderCredentials, ...CLI_CREDENTIALS.opencode])];
}

export function checkAgentAuthentication(
    configuration: AgentConfiguration,
    environment: NodeJS.ProcessEnv = process.env
): AgentAuthenticationCheck {

    const variables = credentialVariables(configuration);
    const hasCodexSession = configuration.provider === 'codex' && hasCodexChatGptSession(environment);
    const hasOpenCodeSession = configuration.provider === 'opencode' && hasOpenCodeLocalSession(environment);
    const modelProvider = configuration.modelProvider?.trim().toLowerCase();
    const hasInspectableOpenCodeProvider = !modelProvider
        || ['local', 'ollama', 'lmstudio'].includes(modelProvider)
        || Object.prototype.hasOwnProperty.call(MODEL_PROVIDER_CREDENTIALS, modelProvider);
    if (hasCodexSession || hasOpenCodeSession || variables.some((variable) => hasValue(environment, variable))) {
        return {
            status: 'available',
            variables,
            message: hasCodexSession
                ? 'Local ChatGPT Codex session available from CODEX_HOME/auth.json.'
                : hasOpenCodeSession
                    ? 'Local OpenCode authentication available from its controlled auth store.'
                : `Local credentials available for ${configuration.provider}.`,
        };
    }

    if (configuration.provider === 'codex') {
        return {
            status: 'not_required',
            variables,
            message: 'No exported Codex credential found; authentication will be resolved by the preinitialized Codex CLI on the runner.',
        };
    }

    if (configuration.provider === 'opencode' && modelProvider && !hasInspectableOpenCodeProvider) {
        return {
            status: 'not_required',
            variables: [],
            message: `Credential resolution for the custom OpenCode provider "${modelProvider}" is delegated to OpenCode configuration or its controlled auth store.`,
        };
    }

    if (configuration.provider === 'opencode' && ['local', 'ollama', 'lmstudio'].includes(configuration.modelProvider?.trim().toLowerCase() || '')) {
        return {
            status: 'not_required',
            variables,
            message: `No external credential is required for the local ${configuration.modelProvider} model provider.`,
        };
    }

    return {
        status: 'missing',
        variables,
        message: `No local credentials found for ${configuration.provider}. Set one of: ${variables.join(', ')}.`,
    };
}
