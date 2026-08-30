import type { AgentProvider } from '../model/agent';

export const DEFAULT_AGENT_EXECUTABLES: Readonly<Record<AgentProvider, string>> = {
    codex: 'codex',
    opencode: 'opencode',
    cursor: 'agent',
};

export type AgentProvisioningMode = 'auto' | 'always' | 'disabled';

export function resolveAgentProvisioningMode(value: string | undefined): AgentProvisioningMode {
    const mode = value?.trim().toLowerCase() || 'auto';
    if (mode === 'auto' || mode === 'always' || mode === 'disabled') return mode;
    throw new Error('AGENT_PROVISIONING must be one of: auto, always, disabled.');
}

export function shouldSkipProvisioning(
    mode: AgentProvisioningMode,
    executable: string,
    alreadyProvisioned: ReadonlySet<string>,
    executableAvailable: boolean,
): boolean {
    return alreadyProvisioned.has(executable) || (mode !== 'always' && executableAvailable);
}

export function provisioningDisabledError(provider: AgentProvider, executable: string): Error {
    return new Error(`Agent provisioning is disabled and the ${provider} CLI executable "${executable}" is not available.`);
}
