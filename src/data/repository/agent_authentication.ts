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

const CLI_CREDENTIALS: Readonly<Record<AgentConfiguration['provider'], readonly string[]>> = {
    opencode: ['OPENCODE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'],
    cursor: ['CURSOR_API_KEY'],
    codex: ['CODEX_ACCESS_TOKEN', 'OPENAI_API_KEY'],
};

function hasValue(environment: NodeJS.ProcessEnv, variable: string): boolean {
    return Boolean(environment[variable]?.trim());
}

function hasCodexChatGptSession(environment: NodeJS.ProcessEnv): boolean {
    const codexHome = environment.CODEX_HOME?.trim() || join(homedir(), '.codex');
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

export function checkAgentAuthentication(
    configuration: AgentConfiguration,
    environment: NodeJS.ProcessEnv = process.env
): AgentAuthenticationCheck {

    const variables = CLI_CREDENTIALS[configuration.provider];
    const hasCodexSession = configuration.provider === 'codex' && hasCodexChatGptSession(environment);
    if (hasCodexSession || variables.some((variable) => hasValue(environment, variable))) {
        return {
            status: 'available',
            variables,
            message: hasCodexSession
                ? 'Local ChatGPT Codex session available from CODEX_HOME/auth.json.'
                : `Local credentials available for ${configuration.provider}.`,
        };
    }

    return {
        status: 'missing',
        variables,
        message: `No local credentials found for ${configuration.provider}. Set one of: ${variables.join(', ')}.`,
    };
}
