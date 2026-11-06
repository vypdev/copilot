/** SDK-owned source identity; never a user-selected workspace or provider option. */
export interface AgentSourceSnapshot {
    readonly kind: 'pre-branch-sdd';
    readonly phase: 'analysis' | 'draft';
    readonly baseSha: string;
}
export declare const SDD_SOURCE_CONTEXT_REASONS: readonly ["binding-invalid", "git-unavailable", "object-unavailable", "unsafe-entry", "entry-limit", "file-limit", "blob-limit", "byte-limit", "metadata-limit", "materialization-failed", "view-integrity"];
export type SddSourceContextReason = typeof SDD_SOURCE_CONTEXT_REASONS[number];
export interface SddSourceContextDiagnostic {
    readonly sourceCommit: string;
    readonly phase: AgentSourceSnapshot['phase'] | 'unknown';
    readonly reason: SddSourceContextReason;
}
export declare function isSddSourceContextDiagnostic(value: unknown): value is SddSourceContextDiagnostic;
/** Also protects renderers called with untyped external records. */
export declare function sourceContextDiagnostic(value: unknown): SddSourceContextDiagnostic;
export declare function isSddSourceContextReason(value: unknown): value is SddSourceContextReason;
export declare function readAgentSourceSnapshot(value: unknown): AgentSourceSnapshot | undefined;
/** Closed host facts only. Git output, paths, credentials and producer text are discarded. */
export declare class SddSourceContextFailure extends Error {
    readonly reason: SddSourceContextReason;
    readonly source: AgentSourceSnapshot | undefined;
    constructor(reason: SddSourceContextReason, source?: unknown);
}
