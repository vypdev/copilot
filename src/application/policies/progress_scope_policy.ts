import { progressResponseRejected, progressResponsePayload } from './progress_response_rejection_policy';
import { isProgressRequirementId, isProgressSourceLineId, type ProgressResponseReason } from '../../domain/progress_response_diagnostic';
import { progressEvidenceTooLarge } from './progress_diff_partition_policy';
import { AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY } from './agent_output_locale_policy';

export const MAX_PROGRESS_SCOPE_BYTES = 64_000;
export const MAX_PROGRESS_SCOPE_CLAUSES = 32;
const MAX_QUOTE = 1_200;
const MAX_FACT = 800;
export interface ProgressScopeClause { readonly id: string; readonly quote: string; readonly uncertain?: true }
export type ProgressScopeAnchors = Readonly<Record<string, string>>;
export interface ProgressScopeExtraction { readonly scope: ProgressScope; readonly anchors: ProgressScopeAnchors }
export interface ProgressScope { readonly requirements: readonly ProgressScopeClause[]; readonly exclusions: readonly ProgressScopeClause[] }

export interface ProgressScopeSourceLine { readonly id: string; readonly quote: string }
export function progressScopeSourceLines(issue: string): readonly ProgressScopeSourceLine[] {
    const lines = issue.split(/\r?\n/).map((line, index) => ({ id: `L${index + 1}`, quote: line.trim() })).filter(line => line.quote);
    if (lines.length === 0 || lines.length > 1_024 || lines.some(line => [...line.quote].length > MAX_QUOTE)) throw progressEvidenceTooLarge();
    return Object.freeze(lines.map(line => Object.freeze(line)));
}
export function progressScopeResponseSchema(lines: readonly ProgressScopeSourceLine[]) {
    return { type: 'object', additionalProperties: false,
        properties: { outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
            lines: { type: 'array', minItems: lines.length, maxItems: lines.length,
                items: { type: 'object', additionalProperties: false,
                    properties: { id: { type: 'string', enum: lines.map(line => line.id) },
                        kind: { type: 'string', enum: ['required', 'excluded', 'context', 'uncertain'] } },
                    required: ['id', 'kind'] } } }, required: ['outputLocale', 'lines'] } as const;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
export function parseProgressScope(response: unknown, issue: string, locale: string): ProgressScope {
    return parseProgressScopeWithAnchors(response, issue, locale).scope;
}

/** Retains host physical-line identities separately; scope/model JSON is unchanged. */
export function parseProgressScopeWithAnchors(response: unknown, issue: string, locale: string): ProgressScopeExtraction {
    const payload = progressResponsePayload(response, locale, 'scope');
    const source = progressScopeSourceLines(issue);
    const reject = (reason: ProgressResponseReason, field: string, id: unknown = 'none'): never => {
        throw progressResponseRejected({ phase: 'scope', reason, field, requirementId: 'none',
            sourceLineId: isProgressSourceLineId(id) && source.some(line => line.id === id) ? id : 'none' });
    };
    if (!exactKeys(payload, ['outputLocale', 'lines'])) reject('scope-incomplete', '$');
    if (!Array.isArray(payload.lines)) reject('scope-incomplete', '$.lines');
    const input = payload.lines as unknown[];
    if (input.length !== source.length) {
        const missing = source.find(line => !input.some(entry => entry !== null && typeof entry === 'object' && !Array.isArray(entry)
            && (entry as Record<string, unknown>).id === line.id));
        reject('scope-incomplete', '$.lines', missing?.id);
    }
    const seen = new Set<string>();
    const classified = input.map((entry: unknown, index) => {
        const field = `$.lines[${index}]`;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) reject('scope-entry-invalid', field);
        const item = entry as Record<string, unknown>;
        if (!exactKeys(item, ['id', 'kind'])) reject('scope-source-id-invalid', field, item.id);
        if (typeof item.id !== 'string' || !source.some(line => line.id === item.id)) reject('scope-source-id-invalid', `${field}.id`);
        const id = item.id as string;
        if (seen.has(id)) reject('scope-source-id-duplicate', `${field}.id`, id);
        seen.add(id);
        if (!['required', 'excluded', 'context', 'uncertain'].includes(item.kind as string)) reject('scope-classification-invalid', `${field}.kind`, id);
        return { id, kind: item.kind };
    });
    const anchors: Record<string, string> = {};
    function clauses(kinds: readonly string[], prefix: string): readonly ProgressScopeClause[] {
        const selected = source.filter(line => kinds.includes(classified.find(item => item.id === line.id)!.kind as string));
        if (selected.length > MAX_PROGRESS_SCOPE_CLAUSES) reject('scope-clause-limit', '$.lines', selected[MAX_PROGRESS_SCOPE_CLAUSES].id);
        return Object.freeze(selected.map((line, index) => {
            const id = `${prefix}${index + 1}`; anchors[id] = line.id;
            return Object.freeze({ id, quote: line.quote,
                ...(classified.find(item => item.id === line.id)!.kind === 'uncertain' ? { uncertain: true as const } : {}) });
        }));
    }
    const scope = Object.freeze({ requirements: clauses(['required', 'uncertain'], 'R'), exclusions: clauses(['excluded'], 'X') });
    if (scope.requirements.length === 0) reject('scope-no-requirements', '$.lines');
    if (Buffer.byteLength(JSON.stringify(scope), 'utf8') > MAX_PROGRESS_SCOPE_BYTES) reject('scope-budget', '$.lines');
    return Object.freeze({ scope, anchors: Object.freeze(anchors) });
}

const factSchema = { type: 'string', minLength: 1, maxLength: MAX_FACT };
export function scopedProgressResponseSchema(scope: ProgressScope) {
    return {
        type: 'object', additionalProperties: false,
        properties: { outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
            progress: { type: 'number', minimum: 0, maximum: 100 },
            requirements: { type: 'array', minItems: scope.requirements.length, maxItems: scope.requirements.length,
                items: { type: 'object', additionalProperties: false,
                    properties: { id: { type: 'string', enum: scope.requirements.map(requirement => requirement.id) },
                        status: { type: 'string', enum: ['supported', 'missing', 'verification-unknown'] },
                        evidence: { type: 'string', enum: ['source-only', 'external-unverified', 'unavailable', 'contradictory'] },
                        summary: factSchema, remaining: { ...factSchema, type: ['string', 'null'] } },
                    required: ['id', 'status', 'evidence', 'summary', 'remaining'] } } },
        required: ['outputLocale', 'progress', 'requirements'],
    } as const;
}

/** Only exact in-scope entries can reach the existing progress card. No model top-level remaining is published. */
export function parseScopedProgressResponse(response: unknown, locale: string, scope: ProgressScope,
    anchors: ProgressScopeAnchors = {}): { progress: number; summary: string; reasoning: string; remaining: string } {
    const payload = progressResponsePayload(response, locale, 'assessment');
    const reject = (reason: ProgressResponseReason, field: string, candidate: unknown = 'none'): never => {
        const id = isProgressRequirementId(candidate) && scope.requirements.some(requirement => requirement.id === candidate) ? candidate : 'none';
        const source = anchors[id];
        throw progressResponseRejected({ phase: 'assessment', reason, field, requirementId: id,
            sourceLineId: id !== 'none' && isProgressSourceLineId(source) ? source : 'none' });
    };
    if (!exactKeys(payload, ['outputLocale', 'progress', 'requirements'])) reject('response-shape-invalid', '$');
    if (typeof payload.progress !== 'number' || !Number.isFinite(payload.progress) || payload.progress < 0 || payload.progress > 100) reject('progress-invalid', '$.progress');
    if (!Array.isArray(payload.requirements)) reject('requirements-incomplete', '$.requirements');
    const input = payload.requirements as unknown[];
    if (input.length !== scope.requirements.length) {
        const missing = scope.requirements.find(requirement => !input.some(entry => entry !== null && typeof entry === 'object' && !Array.isArray(entry)
            && (entry as Record<string, unknown>).id === requirement.id));
        reject('requirements-incomplete', '$.requirements', missing?.id);
    }
    const seen = new Set<string>();
    const entries = input.map((entry: unknown, index) => {
        const field = `$.requirements[${index}]`;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) reject('requirement-shape-invalid', field);
        const fact = entry as Record<string, unknown>;
        if (!exactKeys(fact, ['id', 'status', 'evidence', 'summary', 'remaining'])) reject('requirement-shape-invalid', field, fact.id);
        if (typeof fact.id !== 'string' || !scope.requirements.some(requirement => requirement.id === fact.id)) reject('requirement-id-invalid', `${field}.id`);
        const id = fact.id as string;
        if (seen.has(id)) reject('requirement-id-duplicate', `${field}.id`, id);
        seen.add(id);
        if (scope.requirements.find(requirement => requirement.id === id)!.uncertain && fact.status !== 'verification-unknown') reject('scope-uncertain', `${field}.status`, id);
        if (!['supported', 'missing', 'verification-unknown'].includes(fact.status as string)) reject('requirement-status-invalid', `${field}.status`, id);
        if (!['source-only', 'external-unverified', 'unavailable', 'contradictory'].includes(fact.evidence as string)) reject('requirement-evidence-invalid', `${field}.evidence`, id);
        function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && [...value].length <= MAX_FACT; }
        if (!text(fact.summary)) reject('requirement-summary-invalid', `${field}.summary`, id);
        if (fact.status === 'supported') {
            if (fact.remaining !== null) reject('requirement-remaining-invalid', `${field}.remaining`, id);
            if (fact.evidence !== 'source-only') reject('requirement-evidence-mismatch', `${field}.evidence`, id);
        } else if (!text(fact.remaining)) reject('requirement-remaining-invalid', `${field}.remaining`, id);
        return { id, summary: fact.summary as string, remaining: fact.remaining as string | null };
    });
    const ordered = scope.requirements.map(requirement => ({ requirement, fact: entries.find(entry => entry.id === requirement.id)! }));
    const summary = ordered.map(({ requirement, fact }) => `[${requirement.id}] ${requirement.quote} — ${fact.summary}`).join('\n');
    const remaining = ordered.filter(({ fact }) => fact.remaining !== null)
        .map(({ requirement, fact }) => `[${requirement.id}] ${requirement.quote} — ${fact.remaining}`).join('\n');
    // Never round an uncertain 99.9 to completion. A percentage cannot authorize approval/merge.
    const progress = payload.progress === 100 ? 100 : Math.min(99, Math.round(payload.progress as number));
    if ((progress === 100) === Boolean(remaining)) reject('progress-completion-mismatch', '$.progress');
    if ([...summary].length > 8_000 || [...remaining].length > 8_000) reject('assessment-text-limit', '$.requirements');
    return { progress, summary, remaining, reasoning: '' };
}
