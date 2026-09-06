import type { AgentCapability, AgentProvider } from '../model/agent';
import { AgentCliError } from './agent_cli_contracts';

const MUTATING_CAPABILITIES = new Set<AgentCapability>(['fixer']);
const FORBIDDEN_CODEX_FLAGS = new Set([
    '--dangerously-bypass-approvals-and-sandbox',
    '--dangerously-bypass-hook-trust',
    '--yolo',
    '--full-auto',
    '--approve-for-me',
    '--search',
    '--add-dir',
    '--cd',
    '-C',
    '--profile',
    '-p',
    '--remote',
    '--remote-auth-token-env',
    '--enable',
    '--output-last-message',
    '-o',
]);
const CONTROLLED_CODEX_CONFIG = new Map([
    ['approval_policy', 'never'],
    ['sandbox_workspace_write.network_access', 'false'],
    ['sandbox_workspace_write.exclude_slash_tmp', 'true'],
    ['sandbox_workspace_write.exclude_tmpdir_env_var', 'true'],
    ['sandbox_workspace_write.writable_roots', '[]'],
    ['allow_login_shell', 'false'],
    ['web_search', 'disabled'],
    ['tools.web_search', 'false'],
    ['features.web_search', 'false'],
    ['features.web_search_cached', 'false'],
    ['features.web_search_request', 'false'],
    ['features.skill_mcp_dependency_install', 'false'],
    ['agents.enabled', 'false'],
    ['project_doc_max_bytes', '0'],
    ['history.persistence', 'none'],
    ['shell_environment_policy.ignore_default_excludes', 'false'],
    ['analytics.enabled', 'false'],
]);

const FORBIDDEN_CODEX_CONFIG_PREFIXES = ['hooks', 'mcp_servers.', 'apps.', 'plugins.'];
const FORBIDDEN_CURSOR_FLAGS = [
    '--api-key', '--header', '-H', '--endpoint', '-e', '--force', '-f', '--yolo', '--auto-review',
    '--approve-mcps', '--trust', '--workspace', '--add-dir', '--plugin-dir', '--worktree', '-w',
    '--resume', '--continue', '--sandbox=disabled',
];
const FORBIDDEN_OPENCODE_FLAGS = [
    '--auto', '--share', '--attach', '--file', '-f', '--dir', '--continue', '-c', '--session', '-s',
    '--fork', '--command', '--password', '-p', '--username', '-u', '--hostname', '--port', '--mdns', '--cors',
];

/**
 * Applies a capability boundary after parsing the command and immediately
 * before spawn, so custom commands cannot bypass the runtime policy.
 */
export function enforceAgentExecutionPolicy(
    provider: AgentProvider | undefined,
    capability: AgentCapability | undefined,
    args: readonly string[],
): string[] {
    if (capability === undefined) return [...args];
    if (provider === 'cursor') return enforceCursorPolicy(capability, args);
    if (provider === 'opencode') return enforceOpenCodePolicy(capability, args);
    if (provider !== 'codex') return [...args];
    if (args.some((argument) => [...FORBIDDEN_CODEX_FLAGS].some((flag) => matchesFlag(argument, flag)))) {
        throw new AgentCliError('Restricted Codex runtime flags are not allowed for agent automation.', 'configuration');
    }
    const configuredValues = configValues(args);
    const forbiddenConfiguration = [...configuredValues.keys()].find((key) =>
        FORBIDDEN_CODEX_CONFIG_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix)),
    );
    if (forbiddenConfiguration) {
        throw new AgentCliError(`Codex configuration ${forbiddenConfiguration} is not allowed for agent automation.`, 'configuration');
    }
    for (const [key, expected] of CONTROLLED_CODEX_CONFIG) {
        const configured = configuredValues.get(key);
        if (configured !== undefined && configured !== expected) {
            throw new AgentCliError(`Codex configuration ${key} must be ${expected}.`, 'configuration');
        }
    }

    const expectedSandbox = MUTATING_CAPABILITIES.has(capability) ? 'workspace-write' : 'read-only';
    const configuredSandbox = flagValue(args, ['--sandbox', '-s']);
    if (configuredSandbox && configuredSandbox !== expectedSandbox) {
        throw new AgentCliError(
            `Codex ${capability} capability requires the ${expectedSandbox} sandbox.`,
            'configuration',
        );
    }
    const configuredSandboxMode = configuredValues.get('sandbox_mode');
    if (configuredSandboxMode && configuredSandboxMode !== expectedSandbox) {
        throw new AgentCliError(`Codex configuration sandbox_mode must be ${expectedSandbox}.`, 'configuration');
    }
    const configuredApproval = flagValue(args, ['--ask-for-approval', '-a']);
    if (configuredApproval && configuredApproval !== 'never') {
        throw new AgentCliError('Codex approval policy must be never for non-interactive automation.', 'configuration');
    }

    const controlled = [...args];
    const stdinIndex = controlled.at(-1) === '-' ? controlled.length - 1 : controlled.length;
    const additions: string[] = [];
    if (!configuredSandbox) additions.push('--sandbox', expectedSandbox);
    for (const flag of ['--strict-config', '--ignore-user-config', '--ignore-rules', '--ephemeral']) {
        if (!controlled.includes(flag)) additions.push(flag);
    }
    for (const [key, value] of CONTROLLED_CODEX_CONFIG) {
        if (!configuredValues.has(key)) additions.push('--config', `${key}=${value}`);
    }
    controlled.splice(stdinIndex, 0, ...additions);
    return controlled;
}

function enforceCursorPolicy(capability: AgentCapability, args: readonly string[]): string[] {
    rejectFlags('Cursor', args, FORBIDDEN_CURSOR_FLAGS);
    const controlled = [...args];
    const sandbox = flagValue(controlled, ['--sandbox']);
    if (sandbox && sandbox !== 'enabled') {
        throw new AgentCliError('Cursor agent automation requires its sandbox to be enabled.', 'configuration');
    }
    if (!sandbox) controlled.push('--sandbox', 'enabled');
    if (!MUTATING_CAPABILITIES.has(capability)) {
        const mode = flagValue(controlled, ['--mode']);
        if (mode && !['ask', 'plan'].includes(mode)) {
            throw new AgentCliError(`Cursor ${capability} capability requires ask or plan mode.`, 'configuration');
        }
        if (!mode && !controlled.includes('--plan')) controlled.push('--mode', 'ask');
    }
    return controlled;
}

function enforceOpenCodePolicy(capability: AgentCapability, args: readonly string[]): string[] {
    rejectFlags('OpenCode', args, FORBIDDEN_OPENCODE_FLAGS);
    const controlled = [...args];
    if (!controlled.includes('--pure')) controlled.push('--pure');
    if (!MUTATING_CAPABILITIES.has(capability)) {
        const agent = flagValue(controlled, ['--agent']);
        if (agent && agent !== 'plan') {
            throw new AgentCliError(`OpenCode ${capability} capability requires the read-only plan agent.`, 'configuration');
        }
        if (!agent) controlled.push('--agent', 'plan');
    }
    return controlled;
}

function rejectFlags(provider: string, args: readonly string[], forbidden: readonly string[]): void {
    const match = args.find((argument) => forbidden.some((flag) => matchesFlag(argument, flag)));
    if (match) throw new AgentCliError(`${provider} flag ${match} is not allowed for agent automation.`, 'configuration');
}

function matchesFlag(argument: string, flag: string): boolean {
    return argument === flag || argument.startsWith(`${flag}=`)
        || (flag.length === 2 && flag.startsWith('-') && argument.startsWith(flag) && argument.length > 2);
}

function configValues(args: readonly string[]): Map<string, string> {
    const values = new Map<string, string>();
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        const raw = argument === '--config' || argument === '-c'
            ? args[index + 1]
            : argument.startsWith('--config=')
                ? argument.slice('--config='.length)
                : argument.startsWith('-c=')
                    ? argument.slice(3)
                    : argument.startsWith('-c') && argument.length > 2
                        ? argument.slice(2)
                        : undefined;
        if (!raw) continue;
        const separator = raw.indexOf('=');
        if (separator <= 0) continue;
        values.set(raw.slice(0, separator).trim(), stripQuotes(raw.slice(separator + 1).trim()));
        if (argument === '--config' || argument === '-c') index += 1;
    }
    return values;
}

function stripQuotes(value: string): string {
    return value.replace(/^(["'])(.*)\1$/, '$2');
}

function flagValue(args: readonly string[], flags: readonly string[]): string | undefined {
    for (const [index, argument] of args.entries()) {
        const inline = flags.find((flag) => argument.startsWith(`${flag}=`));
        if (inline) return argument.slice(inline.length + 1);
        if (flags.includes(argument)) return args[index + 1];
        const compact = flags.find((flag) => flag.length === 2 && argument.startsWith(flag) && argument.length > 2);
        if (compact) return argument.slice(compact.length);
    }
    return undefined;
}
