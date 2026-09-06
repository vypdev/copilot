import type { AgentCapability, AgentProvider } from '../model/agent';
import { AgentCliError } from './agent_cli_contracts';

const MUTATING_CAPABILITIES = new Set<AgentCapability>(['fixer']);
const FORBIDDEN_CODEX_FLAGS = new Set([
    '--dangerously-bypass-approvals-and-sandbox',
    '--dangerously-bypass-hook-trust',
]);

/**
 * Applies a capability boundary after parsing the command and immediately
 * before spawn, so custom commands cannot bypass the runtime policy.
 */
export function enforceAgentExecutionPolicy(
    provider: AgentProvider | undefined,
    capability: AgentCapability | undefined,
    args: readonly string[],
): string[] {
    if (provider !== 'codex' || capability === undefined) return [...args];
    if (args.some((argument) => FORBIDDEN_CODEX_FLAGS.has(argument))) {
        throw new AgentCliError('Dangerous Codex sandbox bypass flags are not allowed.', 'configuration');
    }

    const expectedSandbox = MUTATING_CAPABILITIES.has(capability) ? 'workspace-write' : 'read-only';
    const configuredSandbox = flagValue(args, ['--sandbox', '-s']);
    if (configuredSandbox && configuredSandbox !== expectedSandbox) {
        throw new AgentCliError(
            `Codex ${capability} capability requires the ${expectedSandbox} sandbox.`,
            'configuration',
        );
    }

    const controlled = [...args];
    const stdinIndex = controlled.at(-1) === '-' ? controlled.length - 1 : controlled.length;
    const additions: string[] = [];
    if (!configuredSandbox) additions.push('--sandbox', expectedSandbox);
    if (!controlled.includes('--ignore-user-config')) additions.push('--ignore-user-config');
    controlled.splice(stdinIndex, 0, ...additions);
    return controlled;
}

function flagValue(args: readonly string[], flags: readonly string[]): string | undefined {
    for (const [index, argument] of args.entries()) {
        const inline = flags.find((flag) => argument.startsWith(`${flag}=`));
        if (inline) return argument.slice(inline.length + 1);
        if (flags.includes(argument)) return args[index + 1];
    }
    return undefined;
}
