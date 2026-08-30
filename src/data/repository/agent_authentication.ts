import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentConfiguration, AgentProvider } from '../model/agent';
import {
    allowedCredentialVariables,
    containsCredentialMaterial,
    credentialVariables,
    hasKnownModelProvider,
    hasValue,
    isLocalModelProvider,
    removeAgentCredentials,
} from './agent_credential_policy';

export type AgentCredentialStatus = 'available' | 'missing' | 'not_required';

export interface AgentAuthenticationCheck {
    status: AgentCredentialStatus;
    variables: readonly string[];
    message: string;
}

function hasCodexChatGptSession(environment: NodeJS.ProcessEnv): boolean {
    const codexHome = environment.CODEX_HOME?.trim()
        || (environment === process.env || environment.HOME ? join(environment.HOME || homedir(), '.codex') : undefined);
    return isCodexChatGptAuth(readAuthFile(codexHome ? join(codexHome, 'auth.json') : undefined));
}

function hasOpenCodeLocalSession(environment: NodeJS.ProcessEnv): boolean {
    const dataDirectory = environment.OPENCODE_DATA_DIR?.trim()
        || environment.XDG_DATA_HOME?.trim()
        || (environment === process.env || environment.HOME ? join(environment.HOME || homedir(), '.local', 'share') : undefined);
    const authPath = environment.OPENCODE_AUTH_FILE?.trim()
        || (dataDirectory ? join(dataDirectory, 'opencode', 'auth.json') : undefined);
    return Boolean(dataDirectory && containsCredentialMaterial(readAuthFile(authPath)));
}

function readAuthFile(path: string | undefined): unknown {
    if (!path || !existsSync(path)) return undefined;
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as unknown;
    } catch {
        return undefined;
    }
}

function isCodexChatGptAuth(auth: unknown): boolean {
    if (!auth || typeof auth !== 'object') return false;
    const candidate = auth as {
        auth_mode?: unknown;
        OPENAI_API_KEY?: unknown;
        tokens?: { access_token?: unknown; refresh_token?: unknown };
    };
    return candidate.auth_mode === 'chatgpt'
        && candidate.OPENAI_API_KEY == null
        && typeof candidate.tokens?.access_token === 'string'
        && typeof candidate.tokens?.refresh_token === 'string';
}

/** Keeps only credentials relevant to the selected provider/model process. */
export function buildAgentCliEnvironment(
    provider: AgentProvider | undefined,
    environment: NodeJS.ProcessEnv = process.env,
    modelProvider?: string,
): NodeJS.ProcessEnv {
    const hasLocalCodexSession = provider === 'codex' && hasCodexChatGptSession(environment);
    const isolatedEnvironment = removeAgentCredentials(environment);
    if (hasLocalCodexSession) return isolatedEnvironment;

    for (const variable of allowedCredentialVariables(provider, modelProvider)) {
        if (environment[variable] !== undefined) isolatedEnvironment[variable] = environment[variable];
    }
    return isolatedEnvironment;
}

export function checkAgentAuthentication(
    configuration: AgentConfiguration,
    environment: NodeJS.ProcessEnv = process.env,
): AgentAuthenticationCheck {
    const variables = credentialVariables(configuration);
    const hasCodexSession = configuration.provider === 'codex' && hasCodexChatGptSession(environment);
    const hasOpenCodeSession = configuration.provider === 'opencode' && hasOpenCodeLocalSession(environment);
    const modelProvider = configuration.modelProvider?.trim().toLowerCase();
    const hasConfiguredCredential = variables.some((variable) => hasValue(environment, variable));
    if (hasCodexSession) return availableStatus(variables, 'Local ChatGPT Codex session available from CODEX_HOME/auth.json.');
    if (hasOpenCodeSession) return availableStatus(variables, 'Local OpenCode authentication available from its controlled auth store.');
    if (hasConfiguredCredential) return availableStatus(variables, `Local credentials available for ${configuration.provider}.`);
    return resolveMissingAuthentication(configuration, variables, modelProvider);
}

function availableStatus(variables: readonly string[], message: string): AgentAuthenticationCheck {
    return { status: 'available', variables, message };
}

function resolveMissingAuthentication(
    configuration: AgentConfiguration,
    variables: readonly string[],
    modelProvider: string | undefined,
): AgentAuthenticationCheck {
    if (configuration.provider === 'codex') {
        return {
            status: 'not_required',
            variables,
            message: 'No exported Codex credential found; authentication will be resolved by the preinitialized Codex CLI on the runner.',
        };
    }
    if (configuration.provider === 'opencode' && modelProvider && !hasKnownModelProvider(modelProvider)) {
        return {
            status: 'not_required',
            variables: [],
            message: `Credential resolution for the custom OpenCode provider "${modelProvider}" is delegated to OpenCode configuration or its controlled auth store.`,
        };
    }
    if (configuration.provider === 'opencode' && isLocalModelProvider(modelProvider)) {
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
