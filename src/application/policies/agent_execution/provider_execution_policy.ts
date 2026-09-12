import type { AgentCapability, AgentConfiguration } from '../../../domain/agent';
import type {
    AgentOutputContract,
    AgentOutputProtocol,
    AgentPromptMode,
    AgentWorkspaceMode,
} from '../../../domain/agent_execution_plan';

export interface AgentArtifactTemplate {
    readonly path: string;
    readonly contents: string;
    readonly purpose: 'git-config' | 'provider-config' | 'sandbox-config' | 'output-schema';
}

export interface ProviderExecutionPolicyInput {
    readonly configuration: AgentConfiguration;
    readonly capability: AgentCapability;
    readonly workspace: string;
    readonly runtimeDirectory: string;
    readonly outputSchema?: Record<string, unknown>;
}

export interface ProviderExecutionPolicy {
    readonly argv: readonly string[];
    readonly promptMode: AgentPromptMode;
    readonly outputProtocol: AgentOutputProtocol;
    readonly workspaceMode: AgentWorkspaceMode;
    readonly output: AgentOutputContract;
    readonly environment: Readonly<Record<string, string>>;
    readonly artifacts: readonly AgentArtifactTemplate[];
}

export function assertNever(value: never): never {
    throw new Error(`Unsupported agent provider: ${String(value)}`);
}

/** Build a child path deterministically without introducing filesystem authority. */
export function managedArtifactPath(runtimeDirectory: string, relativePath: string): string {
    return `${runtimeDirectory.replace(/[\\/]+$/u, '')}/${relativePath}`;
}
