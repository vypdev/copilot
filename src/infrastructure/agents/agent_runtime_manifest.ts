import manifestJson from './agent-runtime-manifest.json';
import type { AgentProvider } from '../../domain/agent';

export interface AgentRuntimeManifestEntry {
    readonly executable: string;
    readonly reviewedVersion: string;
    readonly installation?: {
        readonly package: string;
        readonly version: string;
    };
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

export function readAgentRuntimeVersion(provider: AgentProvider, output: string): string {
    const actual = normalizeAgentRuntimeVersion(output);
    if (!actual) throw new Error(`${provider} CLI returned empty version output.`);
    return actual;
}

/** Exact matching applies only to a package installed by Copilot itself. */
export function assertInstalledAgentRuntimeVersion(provider: AgentProvider, output: string): string {
    const actual = readAgentRuntimeVersion(provider, output);
    const expected = getAgentRuntimeManifestEntry(provider).reviewedVersion;
    if (actual !== expected) {
        throw new Error(`${provider} installed CLI version mismatch: expected ${expected}, received ${actual}.`);
    }
    return actual;
}
