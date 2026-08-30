import type { AgentProvider } from '../model/agent';
export declare const DEFAULT_AGENT_EXECUTABLES: Readonly<Record<AgentProvider, string>>;
export type AgentProvisioningMode = 'auto' | 'always' | 'disabled';
export declare function resolveAgentProvisioningMode(value: string | undefined): AgentProvisioningMode;
export declare function shouldSkipProvisioning(mode: AgentProvisioningMode, executable: string, alreadyProvisioned: ReadonlySet<string>, executableAvailable: boolean): boolean;
export declare function provisioningDisabledError(provider: AgentProvider, executable: string): Error;
