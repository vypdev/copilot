import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AgentConfiguration, AgentProvider } from '../model/agent';
import {
    allowedCredentialVariables,
    containsCredentialMaterial,
    credentialVariables,
    hasKnownModelProvider,
    hasValue,
    isLocalModelProvider,
    selectSafeAgentRuntimeEnvironment,
} from './agent_credential_policy';
import { parseAgentCommand } from '../../application/policies/agent_command_parser';

export type AgentCredentialStatus = 'available' | 'missing' | 'not_required';

export interface AgentAuthenticationCheck {
    status: AgentCredentialStatus;
    variables: readonly string[];
    message: string;
}

export interface AgentAuthenticationSystem {
    hasOperationalCodexLogin(executable: string, environment: NodeJS.ProcessEnv): boolean;
}

const DEFAULT_AUTHENTICATION_SYSTEM: AgentAuthenticationSystem = {
    hasOperationalCodexLogin(executable, environment) {
        try {
            execFileSync(executable, ['login', 'status'], {
                env: environment,
                stdio: 'ignore',
                timeout: 15_000,
            });
            return true;
        } catch {
            return false;
        }
    },
};

function hasCodexChatGptSession(environment: NodeJS.ProcessEnv): boolean {
    const codexHome = environment.CODEX_HOME?.trim()
        || (environment === process.env || environment.HOME ? join(environment.HOME || homedir(), '.codex') : undefined);
    return isCodexChatGptAuth(readAuthFile(codexHome ? join(codexHome, 'auth.json') : undefined));
}

function hasOpenCodeLocalSession(environment: NodeJS.ProcessEnv): boolean {
    const dataDirectory = resolveOpenCodeDataDirectory(environment);
    return dataDirectory !== undefined
        && containsCredentialMaterial(readAuthFile(resolveOpenCodeAuthPath(environment, dataDirectory)));
}

function resolveOpenCodeDataDirectory(environment: NodeJS.ProcessEnv): string | undefined {
    const configuredDirectory = environment.OPENCODE_DATA_DIR?.trim() || environment.XDG_DATA_HOME?.trim();
    if (configuredDirectory) return configuredDirectory;
    if (environment !== process.env && !environment.HOME) return undefined;
    return join(environment.HOME || homedir(), '.local', 'share');
}

function resolveOpenCodeAuthPath(environment: NodeJS.ProcessEnv, dataDirectory: string): string {
    return environment.OPENCODE_AUTH_FILE?.trim() || join(dataDirectory, 'opencode', 'auth.json');
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

/** Keeps only explicitly allowed runtime values and credentials for the selected process. */
export function buildAgentCliEnvironment(
    provider: AgentProvider | undefined,
    environment: NodeJS.ProcessEnv = process.env,
    modelProvider?: string,
): NodeJS.ProcessEnv {
    const hasLocalCodexSession = provider === 'codex' && hasCodexChatGptSession(environment);
    const isolatedEnvironment = selectSafeAgentRuntimeEnvironment(environment);
    if (hasLocalCodexSession) return isolatedEnvironment;

    for (const variable of allowedCredentialVariables(provider, modelProvider)) {
        if (environment[variable] !== undefined) isolatedEnvironment[variable] = environment[variable];
    }
    return isolatedEnvironment;
}

export function checkAgentAuthentication(
    configuration: AgentConfiguration,
    environment: NodeJS.ProcessEnv = process.env,
    system: AgentAuthenticationSystem = DEFAULT_AUTHENTICATION_SYSTEM,
): AgentAuthenticationCheck {
    const variables = credentialVariables(configuration);
    const hasCodexSession = configuration.provider === 'codex' && hasCodexChatGptSession(environment);
    const hasOpenCodeSession = configuration.provider === 'opencode' && hasOpenCodeLocalSession(environment);
    const modelProvider = configuration.modelProvider?.trim().toLowerCase();
    const hasConfiguredCredential = variables.some((variable) => hasValue(environment, variable));
    if (hasCodexSession) return availableStatus(variables, 'Local ChatGPT Codex session available from CODEX_HOME/auth.json.');
    if (hasOpenCodeSession) return availableStatus(variables, 'Local OpenCode authentication available from its controlled auth store.');
    if (hasConfiguredCredential) return availableStatus(variables, `Local credentials available for ${configuration.provider}.`);
    if (configuration.provider === 'codex') {
        const executable = configuration.command?.trim()
            ? parseAgentCommand(configuration.command).executable
            : 'codex';
        if (system.hasOperationalCodexLogin(executable, buildAgentCliEnvironment('codex', environment, configuration.modelProvider))) {
            return availableStatus(variables, 'Preinitialized Codex CLI login is operational on the runner.');
        }
    }
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
