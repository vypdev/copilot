import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentCapability, AgentProvider } from '../model/agent';
import { buildAgentCliEnvironment } from './agent_authentication';

export interface PreparedAgentRuntimeEnvironment {
    environment: NodeJS.ProcessEnv;
    cleanup(): void;
}

const NOOP = () => undefined;
const READ_ONLY_OPENCODE_AGENT = 'copilot-controlled-readonly';
const FIXER_OPENCODE_AGENT = 'copilot-controlled-fixer';

/** Builds a per-invocation provider boundary without mutating runner configuration. */
export function prepareAgentRuntimeEnvironment(
    provider: AgentProvider | undefined,
    capability: AgentCapability | undefined,
    source: NodeJS.ProcessEnv = process.env,
    modelProvider?: string,
): PreparedAgentRuntimeEnvironment {
    const environment = buildAgentCliEnvironment(provider, source, modelProvider);
    if (!provider || !capability) return { environment, cleanup: NOOP };
    if (provider === 'opencode') return { environment: hardenOpenCode(environment, capability), cleanup: NOOP };
    if (provider === 'cursor') return hardenCursor(environment, capability);
    return { environment, cleanup: NOOP };
}

function hardenOpenCode(environment: NodeJS.ProcessEnv, capability: AgentCapability): NodeJS.ProcessEnv {
    const fixer = capability === 'fixer';
    const permission: Record<string, unknown> = {
        '*': 'deny',
        read: 'allow',
        glob: 'allow',
        grep: 'allow',
        lsp: 'allow',
        edit: fixer ? 'allow' : 'deny',
        bash: 'deny',
        task: 'deny',
        skill: 'deny',
        webfetch: 'deny',
        websearch: 'deny',
        external_directory: 'deny',
    };
    const agentName = fixer ? FIXER_OPENCODE_AGENT : READ_ONLY_OPENCODE_AGENT;
    const config = {
        permission,
        tools: { bash: false, webfetch: false, websearch: false, write: fixer, edit: fixer },
        agent: {
            [agentName]: {
                description: 'Controlled non-interactive repository automation agent.',
                mode: 'primary',
                permission,
            },
        },
    };
    return {
        ...environment,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
        OPENCODE_PERMISSION: JSON.stringify(permission),
        OPENCODE_DISABLE_AUTOUPDATE: 'true',
        OPENCODE_DISABLE_LSP_DOWNLOAD: 'true',
        OPENCODE_DISABLE_CLAUDE_CODE: 'true',
        OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: 'true',
        OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: 'true',
        OPENCODE_ENABLE_EXA: 'false',
        OPENCODE_ENABLE_PARALLEL: 'false',
    };
}

function hardenCursor(
    environment: NodeJS.ProcessEnv,
    capability: AgentCapability,
): PreparedAgentRuntimeEnvironment {
    const runtimeHome = mkdtempSync(join(tmpdir(), 'copilot-cursor-runtime-'));
    const cursorDirectory = join(runtimeHome, '.cursor');
    mkdirSync(cursorDirectory, { recursive: true });
    const fixer = capability === 'fixer';
    writeFileSync(join(cursorDirectory, 'cli-config.json'), JSON.stringify({
        version: 1,
        editor: { vimMode: false },
        approvalMode: 'allowlist',
        permissions: {
            allow: [],
            deny: [
                'Shell(git)', 'Shell(gh)', 'Shell(ssh)', 'Shell(scp)', 'Shell(curl)',
                'Shell(wget)', 'Shell(nc)', 'Shell(rm)', 'Read(.env*)', 'Read(**/.env*)',
            ],
        },
        sandbox: { mode: 'enabled' },
    }));
    writeFileSync(join(cursorDirectory, 'sandbox.json'), JSON.stringify({
        type: fixer ? 'workspace_readwrite' : 'workspace_readonly',
        additionalReadwritePaths: [],
        additionalReadonlyPaths: [],
        disableTmpWrite: true,
        enableSharedBuildCache: false,
        networkPolicyStrict: true,
        networkPolicy: { default: 'deny', allow: [], deny: [] },
    }));
    return {
        environment: {
            ...environment,
            HOME: runtimeHome,
            CURSOR_CONFIG_DIR: cursorDirectory,
        },
        cleanup: () => rmSync(runtimeHome, { recursive: true, force: true }),
    };
}
