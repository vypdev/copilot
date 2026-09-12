import type { AgentCapability, AgentProvider } from '../../domain/agent';
import type { AgentOutputContract, AgentWorkspaceMode } from '../../domain/agent_execution_plan';

export type AgentExecutionFailureCategory =
    | 'configuration'
    | 'timeout'
    | 'cancelled'
    | 'process'
    | 'output';

export type AgentExecutionSemanticCode =
    | 'agent.policy-rejected'
    | 'agent.failed'
    | 'provider.contract-invalid'
    | 'timeout'
    | 'workflow.cancelled';

interface AgentExecutionIdentityObservation {
    readonly provider: AgentProvider;
    readonly capability: AgentCapability;
}

export type AgentExecutionObservation =
    | (AgentExecutionIdentityObservation & {
        readonly state: 'started';
        readonly phase: 'plan';
    })
    | (AgentExecutionIdentityObservation & {
        readonly state: 'admitted';
        readonly phase: 'preflight';
        readonly durationMilliseconds: number;
        readonly manifestRevision: string;
        readonly version: string;
        readonly workspaceMode: AgentWorkspaceMode;
        readonly outputContract: AgentOutputContract;
        readonly artifactHashes: readonly string[];
    })
    | (AgentExecutionIdentityObservation & {
        readonly state: 'completed';
        readonly phase: 'run';
        readonly durationMilliseconds: number;
        readonly outputBytes: number;
    })
    | (AgentExecutionIdentityObservation & {
        readonly state: 'failed';
        readonly phase: 'preflight' | 'run';
        readonly durationMilliseconds: number;
        readonly failureCategory: AgentExecutionFailureCategory;
        readonly semanticCode: AgentExecutionSemanticCode;
        readonly retryable: boolean;
    });

/** Receives bounded execution facts only; prompts, output, argv, paths, and environment are excluded by type. */
export interface AgentExecutionObserverPort {
    observe(observation: AgentExecutionObservation): void;
}
