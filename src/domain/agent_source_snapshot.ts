/** SDK-owned source identity; never a user-selected workspace or provider option. */
export interface AgentSourceSnapshot {
    readonly kind: 'pre-branch-sdd';
    readonly phase: 'analysis' | 'draft';
    readonly baseSha: string;
}

export const SDD_SOURCE_CONTEXT_REASONS = [
    'binding-invalid', 'git-unavailable', 'object-unavailable', 'unsafe-entry', 'entry-limit',
    'file-limit', 'blob-limit', 'byte-limit', 'metadata-limit',
    'materialization-failed', 'view-integrity',
] as const;
export type SddSourceContextReason = typeof SDD_SOURCE_CONTEXT_REASONS[number];

export interface SddSourceContextDiagnostic {
    readonly sourceCommit: string;
    readonly phase: AgentSourceSnapshot['phase'] | 'unknown';
    readonly reason: SddSourceContextReason;
}

export function isSddSourceContextDiagnostic(value: unknown): value is SddSourceContextDiagnostic {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Object.keys(record).sort().join(',') === 'phase,reason,sourceCommit'
        && isSddSourceContextReason(record.reason)
        && ((record.sourceCommit === 'none' && record.phase === 'unknown')
            || (typeof record.sourceCommit === 'string' && /^[a-f0-9]{40}$/u.test(record.sourceCommit)
                && (record.phase === 'analysis' || record.phase === 'draft')));
}

/** Also protects renderers called with untyped external records. */
export function sourceContextDiagnostic(value: unknown): SddSourceContextDiagnostic {
    return Object.freeze(isSddSourceContextDiagnostic(value)
        ? { sourceCommit: value.sourceCommit, phase: value.phase, reason: value.reason }
        : { sourceCommit: 'none', phase: 'unknown', reason: 'binding-invalid' });
}

export function isSddSourceContextReason(value: unknown): value is SddSourceContextReason {
    return typeof value === 'string' && (SDD_SOURCE_CONTEXT_REASONS as readonly string[]).includes(value);
}

export function readAgentSourceSnapshot(value: unknown): AgentSourceSnapshot | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(',') !== 'baseSha,kind,phase'
        || record.kind !== 'pre-branch-sdd' || !['analysis', 'draft'].includes(record.phase as string)
        || typeof record.baseSha !== 'string' || !/^[a-f0-9]{40}$/u.test(record.baseSha)) return;
    return Object.freeze({ kind: 'pre-branch-sdd', phase: record.phase as AgentSourceSnapshot['phase'], baseSha: record.baseSha });
}

/** Closed host facts only. Git output, paths, credentials and producer text are discarded. */
export class SddSourceContextFailure extends Error {
    readonly reason: SddSourceContextReason;
    readonly source: AgentSourceSnapshot | undefined;
    constructor(reason: SddSourceContextReason, source?: unknown) {
        super('The selected immutable source view could not be prepared; existing SDD and branch state was retained.');
        this.name = 'SddSourceContextFailure';
        this.reason = isSddSourceContextReason(reason) ? reason : 'binding-invalid';
        this.source = readAgentSourceSnapshot(source);
        Object.freeze(this);
    }
}
