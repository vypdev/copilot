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

/** Closed stage identity; no executable path or provider output is admitted. */
export type AgentExecutionPreflightStage =
    | 'workspace' | 'ambient-configuration' | 'manifest' | 'selection'
    | 'resolution' | 'invocation-trust' | 'environment' | 'version'
    | 'artifacts' | 'policy';

/** Fixed Windows executable trust reason; raw ACLs and paths stay local. */
export type AgentExecutionPreflightDiagnostic =
    | 'acl-file-owner' | 'acl-ancestor-owner' | 'acl-writable'
    | 'acl-format-batch' | 'acl-format-dacl' | 'acl-format-flags'
    | 'acl-format-ace' | 'acl-format-rights'
    | 'acl-query-timeout' | 'acl-query-failed'
    | 'acl-identity' | 'acl-unavailable';

/** Closed, untrusted-provider diagnostic hints; no provider text crosses this port. */
export type AgentExecutionExitDiagnostic =
    | 'reported-authentication'
    | 'reported-model-unavailable'
    | 'reported-unsupported-option'
    | 'reported-unsupported-configuration'
    | 'reported-transport-or-rate-limit'
    | 'unclassified';

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
        readonly preflightStage?: AgentExecutionPreflightStage;
        readonly preflightDiagnostic?: AgentExecutionPreflightDiagnostic;
        readonly semanticCode: AgentExecutionSemanticCode;
        readonly retryable: boolean;
        readonly exitCode?: number;
        readonly exitDiagnostic?: AgentExecutionExitDiagnostic;
    });

/** Receives bounded execution facts only; prompts, output, argv, paths, and environment are excluded by type. */
export interface AgentExecutionObserverPort {
    observe(observation: AgentExecutionObservation): void;
}
