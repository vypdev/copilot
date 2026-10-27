import { ApplicationError } from '../errors/application_error';
import { AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY, agentOutputLocaleFailureMessage, validateAgentOutputLocale } from './agent_output_locale_policy';

export const MAX_PROGRESS_SCOPE_BYTES = 64_000;
const MAX_CLAUSES = 32;
const MAX_QUOTE = 1_200;
const MAX_FACT = 800;
export interface ProgressScopeClause { readonly id: string; readonly quote: string }
export interface ProgressScope { readonly requirements: readonly ProgressScopeClause[]; readonly exclusions: readonly ProgressScopeClause[] }

const quotesSchema = { type: 'array', maxItems: MAX_CLAUSES, items: { type: 'string', minLength: 1, maxLength: MAX_QUOTE } };
export const PROGRESS_SCOPE_SCHEMA = {
    type: 'object', additionalProperties: false,
    properties: { outputLocale: AGENT_OUTPUT_LOCALE_SCHEMA_PROPERTY,
        requirements: { ...quotesSchema, minItems: 0 }, exclusions: quotesSchema },
    required: ['outputLocale', 'requirements', 'exclusions'],
} as const;


function invalid(): never {
    throw new ApplicationError('agent.failed', 'Progress scope or requirement evidence was incomplete, contradictory or unsupported. Existing progress was retained.');
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
    if (!exactKeys(payload, ['outputLocale', 'requirements', 'exclusions'])) invalid();
    const lines = issue.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const seen = new Set<string>();
    function clauses(value: unknown, prefix: string, minimum: number): readonly ProgressScopeClause[] {
        if (!Array.isArray(value) || value.length < minimum || value.length > MAX_CLAUSES) invalid();
        const quotes = value.map((quote: unknown) => {
            if (typeof quote !== 'string' || !quote || [...quote].length > MAX_QUOTE || !lines.includes(quote) || seen.has(quote)) invalid();
            seen.add(quote);
            return quote;
        }).sort((a, b) => lines.indexOf(a) - lines.indexOf(b));
        return Object.freeze(quotes.map((quote, index) => Object.freeze({ id: `${prefix}${index + 1}`, quote })));
    }
    const result = Object.freeze({ requirements: clauses(payload.requirements, 'R', 1), exclusions: clauses(payload.exclusions, 'X', 0) });
    if (Buffer.byteLength(JSON.stringify(result), 'utf8') > MAX_PROGRESS_SCOPE_BYTES) invalid();
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
