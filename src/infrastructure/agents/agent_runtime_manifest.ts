import manifestJson from './agent-runtime-manifest.json';
import type { AgentProvider } from '../../domain/agent';

export interface AgentRuntimeManifestEntry {
    readonly executable: string;
    readonly version: string;
    readonly package?: string;
}

export interface AgentRuntimeManifest {
    readonly revision: string;
    readonly providers: Readonly<Record<AgentProvider, AgentRuntimeManifestEntry>>;
}

const manifest = manifestJson satisfies AgentRuntimeManifest;

export function getAgentRuntimeManifest(): AgentRuntimeManifest {
    return manifest;
}

export function getAgentRuntimeManifestEntry(provider: AgentProvider): AgentRuntimeManifestEntry {
    return manifest.providers[provider];
}

export function normalizeAgentRuntimeVersion(output: string): string {
    return output.trim().split(/\r?\n/, 1)[0].trim();
}

export function assertAgentRuntimeVersion(provider: AgentProvider, output: string): string {
    const actual = normalizeAgentRuntimeVersion(output);
    const expected = getAgentRuntimeManifestEntry(provider).version;
    if (actual !== expected) {
        throw new Error(`${provider} CLI version mismatch: expected ${expected}, received ${actual || 'unparseable output'}.`);
    }
    return actual;
}
