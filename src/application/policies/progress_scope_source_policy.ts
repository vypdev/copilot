import { CONFIGURATION_SCHEMA_VERSION, readConfigurationBlock } from '../../domain/configuration_markers';
import { ApplicationError } from '../errors/application_error';
import { progressEvidenceTooLarge } from './progress_diff_partition_policy';
import { progressResponseRejected } from './progress_response_rejection_policy';

export interface ProgressScopeSourceLine { readonly id: string; readonly quote: string }
export interface ProgressScopeSource {
    readonly lines: readonly ProgressScopeSourceLine[];
    readonly totalLines: number;
    readonly operationalLines: number;
}

/** Bound and account for every original line before selecting human-owned scope. */
export function captureProgressScopeSource(issue: string): ProgressScopeSource {
    let offset = 0;
    const original = (issue.match(/[^\n]*(?:\n|$)/gu)!).map((text, index) => {
        const start = offset; offset += text.length;
        return { id: `L${index + 1}`, quote: text.replace(/\r?\n$/u, '').trim(), start, end: offset };
    }).filter(line => line.quote);
    if (original.length === 0 || original.length > 1_024 || original.some(line => [...line.quote].length > 1_200)) throw progressEvidenceTooLarge();
    const state = readConfigurationBlock(issue);
    const invalid = () => new ApplicationError('configuration.invalid', 'Stored issue configuration is ambiguous, malformed or unsupported. Existing progress was retained.');
    if (state.kind === 'invalid') throw invalid();
    if (state.kind === 'present') {
        let payload: unknown;
        try { payload = JSON.parse(state.content); }
        catch { throw invalid(); }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)
            || (payload as Record<string, unknown>).schemaVersion !== CONFIGURATION_SCHEMA_VERSION) throw invalid();
    }
    const human = original.filter(line => state.kind !== 'present' || line.end <= state.start || line.start >= state.end);
    if (!human.length) throw progressResponseRejected({ phase: 'scope', reason: 'scope-no-requirements', field: '$.lines', requirementId: 'none', sourceLineId: 'none' });
    return Object.freeze({ lines: Object.freeze(human.map(({ id, quote }) => Object.freeze({ id, quote }))),
        totalLines: original.length, operationalLines: original.length - human.length });
}
export function progressScopeSourceLines(issue: string): readonly ProgressScopeSourceLine[] {
    return captureProgressScopeSource(issue).lines;
}
