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
    if (hasCodexSession || hasOpenCodeSession || hasConfiguredCredential) {
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
