import type { AgentCapability, AgentProvider } from './agent';

export const AGENT_EXECUTION_TIMEOUT_MAX_MS = 15 * 60 * 1000;
export const AGENT_PROMPT_MAX_BYTES = 512 * 1024;
export const AGENT_OUTPUT_MAX_BYTES = 4 * 1024 * 1024;

export type AgentWorkspaceMode = 'read-only' | 'workspace-write';
export type AgentPromptMode = 'stdin' | 'final-argv';
export type AgentOutputProtocol = 'plain-text' | 'json-lines-text-events';
export type AgentOutputContract = 'text' | 'local-json-schema' | 'native-and-local-json-schema';

export interface AgentManagedArtifact {
    readonly path: string;
    readonly sha256: string;
    readonly purpose: 'git-config' | 'provider-config' | 'sandbox-config' | 'output-schema';
}

export interface AgentRuntimeContract {
    readonly provider: AgentProvider;
    readonly version: string;
    readonly manifestRevision: string;
}

/** Complete, admitted authority passed to the generic process adapter. */
export interface AgentExecutionPlan {
    readonly provider: AgentProvider;
    readonly capability: AgentCapability;
    readonly executable: string;
    readonly argv: readonly string[];
    readonly promptMode: AgentPromptMode;
    readonly outputProtocol: AgentOutputProtocol;
    readonly workspace: string;
    readonly workspaceMode: AgentWorkspaceMode;
    readonly childNetwork: 'deny';
    readonly approval: 'never';
    readonly sessionPersistence: false;
    readonly output: AgentOutputContract;
    readonly timeoutMs: number;
    readonly maxPromptBytes: number;
    readonly maxOutputBytes: number;
    readonly environment: Readonly<Record<string, string>>;
    readonly artifacts: readonly AgentManagedArtifact[];
    readonly runtimeDirectory: string;
    readonly runtimeContract: AgentRuntimeContract;
}

export function workspaceModeForCapability(capability: AgentCapability): AgentWorkspaceMode {
    return capability === 'fixer' ? 'workspace-write' : 'read-only';
}
