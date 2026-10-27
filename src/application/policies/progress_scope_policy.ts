import { ApplicationError } from '../errors/application_error';
import { progressEvidenceTooLarge } from './progress_diff_partition_policy';
import { AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY, agentOutputLocaleFailureMessage, validateAgentOutputLocale } from './agent_output_locale_policy';

export const MAX_PROGRESS_SCOPE_BYTES = 64_000;
const MAX_CLAUSES = 32;
const MAX_QUOTE = 1_200;
const MAX_FACT = 800;
export interface ProgressScopeClause { readonly id: string; readonly quote: string; readonly uncertain?: true }
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

function invalid(reason = 'assessment-invalid'): never {
    throw new ApplicationError('agent.failed', `Progress scope or requirement evidence was rejected (${reason}). Existing progress was retained.`);
}
function payloadFor(response: unknown, locale: string): Readonly<Record<string, unknown>> {
    const result = validateAgentOutputLocale(response, locale);
    if (result.kind === 'invalid') throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(result));
    return result.payload;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
export function parseProgressScope(response: unknown, issue: string, locale: string): ProgressScope {
    const payload = payloadFor(response, locale);
    const source = progressScopeSourceLines(issue);
    if (!exactKeys(payload, ['outputLocale', 'lines']) || !Array.isArray(payload.lines) || payload.lines.length !== source.length) invalid('scope-incomplete');
    const seen = new Set<string>();
    const classified = payload.lines.map((entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid('scope-entry-invalid');
        const item = entry as Record<string, unknown>;
        if (!exactKeys(item, ['id', 'kind']) || typeof item.id !== 'string' || !source.some(line => line.id === item.id)) invalid('scope-source-id-invalid');
        if (seen.has(item.id)) invalid('scope-source-id-duplicate');
        seen.add(item.id);
        if (!['required', 'excluded', 'context', 'uncertain'].includes(item.kind as string)) invalid('scope-classification-invalid');
        return { id: item.id, kind: item.kind };
    });
    function clauses(kinds: readonly string[], prefix: string): readonly ProgressScopeClause[] {
        const selected = source.filter(line => kinds.includes(classified.find(item => item.id === line.id)!.kind as string));
        if (selected.length > MAX_CLAUSES) invalid('scope-clause-limit');
        return Object.freeze(selected.map((line, index) => Object.freeze({ id: `${prefix}${index + 1}`, quote: line.quote,
            ...(classified.find(item => item.id === line.id)!.kind === 'uncertain' ? { uncertain: true as const } : {}) })));
    }
    const result = Object.freeze({ requirements: clauses(['required', 'uncertain'], 'R'), exclusions: clauses(['excluded'], 'X') });
    if (result.requirements.length === 0) invalid('scope-no-requirements');
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_PROGRESS_SCOPE_BYTES) invalid('scope-budget');
    return result;
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
export function parseScopedProgressResponse(response: unknown, locale: string, scope: ProgressScope): { progress: number; summary: string; reasoning: string; remaining: string } {
    const payload = payloadFor(response, locale);
    if (!exactKeys(payload, ['outputLocale', 'progress', 'requirements']) || typeof payload.progress !== 'number'
        || !Number.isFinite(payload.progress) || payload.progress < 0 || payload.progress > 100
        || !Array.isArray(payload.requirements) || payload.requirements.length !== scope.requirements.length) invalid();
    const seen = new Set<string>();
    const entries = payload.requirements.map((entry: unknown) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) invalid();
        const fact = entry as Record<string, unknown>;
        if (!exactKeys(fact, ['id', 'status', 'evidence', 'summary', 'remaining']) || typeof fact.id !== 'string'
            || !scope.requirements.some(requirement => requirement.id === fact.id) || seen.has(fact.id)) invalid();
        seen.add(fact.id);
        if (scope.requirements.find(requirement => requirement.id === fact.id)!.uncertain && fact.status !== 'verification-unknown') invalid('scope-uncertain');
        if (!['supported', 'missing', 'verification-unknown'].includes(fact.status as string)
            || !['source-only', 'external-unverified', 'unavailable', 'contradictory'].includes(fact.evidence as string)) invalid();
        function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && [...value].length <= MAX_FACT; }
        if (!text(fact.summary)) invalid();
        if (fact.status === 'supported') {
            if (fact.remaining !== null || fact.evidence !== 'source-only') invalid();
        } else if (!text(fact.remaining)) invalid();
        return { id: fact.id, summary: fact.summary, remaining: fact.remaining as string | null };
    });
    const ordered = scope.requirements.map(requirement => ({ requirement, fact: entries.find(entry => entry.id === requirement.id)! }));
    const summary = ordered.map(({ requirement, fact }) => `[${requirement.id}] ${requirement.quote} — ${fact.summary}`).join('\n');
    const remaining = ordered.filter(({ fact }) => fact.remaining !== null)
        .map(({ requirement, fact }) => `[${requirement.id}] ${requirement.quote} — ${fact.remaining}`).join('\n');
    // Never round an uncertain 99.9 to completion. A percentage is still an estimate, not a review/merge approval.
    const progress = payload.progress === 100 ? 100 : Math.min(99, Math.round(payload.progress));
    if ((progress === 100) === Boolean(remaining) || [...summary].length > 8_000 || [...remaining].length > 8_000) invalid();
    return { progress, summary, remaining, reasoning: '' };
}
