import type { AgentTask, AgentConfiguration } from './agent';

export type AgentExecutionPhase =
    | 'validation'
    | 'install'
    | 'startup'
    | 'readiness'
    | 'invocation'
    | 'parse'
    | 'verification'
    | 'commit'
    | 'push'
    | 'cleanup';

export type AgentFailureCategory =
    | 'configuration'
    | 'unavailable'
    | 'authentication'
    | 'authorization'
    | 'rate_limit'
    | 'timeout'
    | 'cancelled'
    | 'malformed_response'
    | 'workspace'
    | 'verification'
    | 'process'
    | 'network'
    | 'unknown';

export interface AgentExecutionContext {
    readonly repository: string;
    readonly commitSha: string;
    readonly workspaceRoot: string;
    readonly invocationId: string;
    readonly deadlineAt: number;
}

export interface AgentExecutionRequest {
    readonly task: AgentTask;
    readonly configuration: AgentConfiguration;
    readonly context: AgentExecutionContext;
    readonly prompt: string;
    readonly signal?: AbortSignal;
}

export interface AgentExecutionMetadata {
    readonly provider: string;
    readonly transport: string;
    readonly invocationId: string;
    readonly sessionId?: string;
    readonly elapsedMs: number;
}

export interface AgentExecutionSuccess<T> {
    readonly status: 'succeeded';
    readonly value: T;
    readonly metadata: AgentExecutionMetadata;
}

export interface AgentExecutionSkipped {
    readonly status: 'skipped';
    readonly reason: string;
    readonly metadata: AgentExecutionMetadata;
}

export interface AgentExecutionFailure {
    readonly status: 'failed' | 'cancelled';
    readonly phase: AgentExecutionPhase;
    readonly category: AgentFailureCategory;
    readonly message: string;
    readonly retryable: boolean;
    readonly workspaceChanged: boolean;
    readonly cleanupCompleted: boolean;
    readonly metadata: AgentExecutionMetadata;
    readonly exitCode?: number;
    readonly httpStatus?: number;
}

export type AgentExecutionResult<T> =
    | AgentExecutionSuccess<T>
    | AgentExecutionSkipped
    | AgentExecutionFailure;

export interface AgentFinding {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly file?: string;
    readonly line?: number;
    readonly severity?: string;
    readonly suggestion?: string;
}

export interface FindingsResult {
    readonly findings: readonly AgentFinding[];
    readonly resolvedFindingIds: readonly string[];
}

export interface FixerResult {
    readonly summary: string;
    readonly changedFiles: readonly string[];
    readonly verificationPassed: boolean;
}
