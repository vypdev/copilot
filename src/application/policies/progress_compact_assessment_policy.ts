import { baseLanguage } from '../../domain/locale';
import { isProgressAssessmentLengthDiagnostic, type ProgressAssessmentLengthDiagnostic } from '../../domain/progress_assessment_length_failure';
import { normalizeProgressCompletionDiagnostic, type ProgressCompletionDiagnostic } from '../../domain/progress_completion_diagnostic';
import { progressResponsePayload, progressResponseRejected } from './progress_response_rejection_policy';
import type { ProgressScope, ProgressScopeAnchors } from './progress_scope_policy';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: RecordValue, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const ASSESSMENTS = Object.freeze({
    supported: { status: 'supported', evidence: 'source-only', summary: 'present', remaining: null },
    partial: { status: 'missing', evidence: 'source-only', summary: 'partial', remaining: 'implementation' },
    missing: { status: 'missing', evidence: 'source-only', summary: 'absent', remaining: 'implementation' },
    contradictory: { status: 'missing', evidence: 'contradictory', summary: 'absent', remaining: 'implementation' },
    'source-unverified': { status: 'verification-unknown', evidence: 'source-only', summary: 'present', remaining: 'verification' },
    'partial-unverified': { status: 'verification-unknown', evidence: 'source-only', summary: 'partial', remaining: 'verification' },
    'execution-unverified': { status: 'verification-unknown', evidence: 'external-unverified', summary: 'unknown', remaining: 'verification' },
    'evidence-unavailable': { status: 'verification-unknown', evidence: 'unavailable', summary: 'unknown', remaining: 'evidence' },
    'evidence-contradictory': { status: 'verification-unknown', evidence: 'contradictory', summary: 'unknown', remaining: 'clarification' },
    'scope-unclear': { status: 'verification-unknown', evidence: 'unavailable', summary: 'unknown', remaining: 'clarification' },
} as const);
const LABELS = Object.freeze({
    en: Object.freeze({ summary: Object.freeze({ present: 'In source', partial: 'Partial', absent: 'Missing', unknown: 'Unclear' }),
        remaining: Object.freeze({ implementation: 'Implement', verification: 'Verify', clarification: 'Clarify', evidence: 'Get proof' }) }),
    es: Object.freeze({ summary: Object.freeze({ present: 'En código', partial: 'Parcial', absent: 'Falta', unknown: 'Sin datos' }),
        remaining: Object.freeze({ implementation: 'Completar', verification: 'Verificar', clarification: 'Aclarar', evidence: 'Evidencia' }) }),
});
export const COMPACT_PROGRESS_HINT_MAX_BYTES = 256;
const PREFIX = '\n\nComplete closed-fact assessment protocol\nThe current native schema encodes status, evidence, summary and remaining as one assessment code. This protocol supersedes the earlier response example for this request only. Return the SAME complete assigned batch, every original identity and citation, with no prose fields. Codes are fixed semantic identifiers, not human sentences.\n'
    + 'supported: fully supported by source, no remaining; partial: partly implemented with missing work; missing: implementation absent; contradictory: source behavior contradicts the requirement and needs implementation. These last three mean missing implementation.\n'
    + 'source-unverified: implementation visible but required verification unknown; partial-unverified: partial source and unknown verification; execution-unverified: external execution unverified; evidence-unavailable: required evidence absent; evidence-contradictory: conflicting evidence needs clarification; scope-unclear: requirement needs clarification. These six mean verification-unknown. Any uncertain scope MUST use scope-unclear.\n'
    + 'Source observations never attest test execution, review, coverage or approval. Choose the percentage after all codes: 100 only when every code is supported, otherwise below 100. Do not omit, merge or reinterpret requirements. The host renders complete short labels inside the ORIGINAL hard allocation; it never clips model prose.\n';
const FACTS = '\n[BEGIN_CLOSED_PREVIOUS_ASSESSMENT_FACTS]\n';
const SUFFIX = '\n[END_CLOSED_PREVIOUS_ASSESSMENT_FACTS]';

export interface CompactProgressAssessmentPlan {
    readonly schema: RecordValue;
    readonly sourceSchema: RecordValue;
    readonly locale: string;
}

/** A separate finite wire shape; the original schema and published text allocation remain intact. */
export function compactProgressAssessmentPlan(schema: RecordValue, locale: string): CompactProgressAssessmentPlan | undefined {
    const properties = schema.properties, definition = record(properties) ? properties.requirements : undefined;
    const items = record(definition) ? definition.items : undefined, fields = record(items) ? items.properties : undefined;
    if (!record(properties) || !record(definition) || !record(items) || !record(fields)
        || !record(fields.summary) || !record(fields.remaining) || !Array.isArray(items.required)) return undefined;
    const required = items.required;
    const fieldKeys = Object.keys(fields);
    if (items.type !== 'object' || items.additionalProperties !== false
        || fieldKeys.some(key => !['id', 'status', 'evidence', 'summary', 'remaining', 'citations'].includes(key))
        || required.length !== fieldKeys.length || new Set(required).size !== required.length
        || !fieldKeys.every(key => required.includes(key))) return undefined;
    if (fields.summary.type !== 'string' || !Array.isArray(fields.remaining.type)
        || [...fields.remaining.type].sort().join(',') !== 'null,string'
        || !['id', 'status', 'evidence', 'summary', 'remaining'].every(key => record(fields[key]) && required.includes(key))) return undefined;
    for (const [name, values] of [['status', ['supported', 'missing', 'verification-unknown']], ['evidence', ['source-only', 'external-unverified', 'unavailable', 'contradictory']]] as const) {
        const field = fields[name] as RecordValue;
        if (field.type !== 'string' || !Array.isArray(field.enum) || [...field.enum].sort().join(',') !== [...values].sort().join(',')
            || Object.keys(field).some(key => !['type', 'enum', 'description'].includes(key))) return undefined;
    }
    for (const field of [fields.summary, fields.remaining]) {
        if (field.minLength !== 1 || typeof field.maxLength !== 'number' || !Number.isSafeInteger(field.maxLength)
            || field.maxLength < 9 || field.maxLength > 800
            || Object.keys(field).some(key => !['type', 'minLength', 'maxLength', 'description'].includes(key))) return undefined;
    }
    const { summary: _summary, remaining: _remaining, status: _status, evidence: _evidence, id, ...identities } = fields;
    // Reserve the small semantic enum before a potentially large citation dictionary.
    const codedFields = { id, assessment: { type: 'string', enum: Object.keys(ASSESSMENTS) }, ...identities };
    const codedItems = { ...items, properties: codedFields,
        required: [...required.filter(key => !['summary', 'remaining', 'status', 'evidence'].includes(key)), 'assessment'] };
    return Object.freeze({ sourceSchema: schema, locale,
        schema: { ...schema, properties: { ...properties, requirements: { ...definition, items: codedItems } } } });
}

/** Model metadata keeps the exact requested locale; host-owned labels use the bundled whole-catalog fallback. */
export function decodeCompactProgressAssessment(response: unknown, plan: CompactProgressAssessmentPlan, scope: ProgressScope,
    anchors: ProgressScopeAnchors): RecordValue {
    const payload = progressResponsePayload(response, plan.locale, 'assessment');
    const properties = plan.schema.properties as RecordValue;
    const fields = ((properties.requirements as RecordValue).items as RecordValue).properties as RecordValue;
    const fail = (index: number, candidate: unknown = 'none', reason: 'response-shape-invalid' | 'requirements-incomplete' | 'requirement-shape-invalid' | 'requirement-summary-invalid' | 'requirement-status-invalid' | 'requirement-id-invalid' | 'requirement-id-duplicate' = 'requirement-shape-invalid'): never => {
        const id = scope.requirements.find(requirement => requirement.id === candidate)?.id ?? 'none';
        throw progressResponseRejected({ phase: 'assessment', reason, field: index < 0 ? '$.requirements' : `$.requirements[${index}].assessment`,
            requirementId: id, sourceLineId: anchors[id] ?? 'none' });
    };
    if (!exact(payload, Object.keys(properties))) fail(-1, 'none', 'response-shape-invalid');
    if (!Array.isArray(payload.requirements) || payload.requirements.length !== scope.requirements.length) fail(-1, 'none', 'requirements-incomplete');
    const labels = baseLanguage(plan.locale) === 'es' ? LABELS.es : LABELS.en;
    const seen = new Set<string>();
    const requirements = (payload.requirements as unknown[]).map((value, index) => {
        if (!record(value) || !exact(value, Object.keys(fields))) return fail(index);
        if (typeof value.id !== 'string' || !scope.requirements.some(requirement => requirement.id === value.id)) return fail(index, 'none', 'requirement-id-invalid');
        if (seen.has(value.id)) return fail(index, value.id, 'requirement-id-duplicate');
        seen.add(value.id);
        if (typeof value.assessment !== 'string' || !Object.prototype.hasOwnProperty.call(ASSESSMENTS, value.assessment)) return fail(index, value.id, 'requirement-summary-invalid');
        const assessed = ASSESSMENTS[value.assessment as keyof typeof ASSESSMENTS];
        const uncertain = scope.requirements.find(requirement => requirement.id === value.id)?.uncertain;
        if (uncertain && value.assessment !== 'scope-unclear') return fail(index, value.id, 'requirement-status-invalid');
        const { assessment: _assessment, ...identity } = value;
        return { ...identity, status: assessed.status, evidence: assessed.evidence,
            summary: labels.summary[assessed.summary], remaining: assessed.remaining === null ? null : labels.remaining[assessed.remaining] };
    });
    return { ...payload, requirements };
}

export function compactProgressAssessmentPrompt(prompt: string, facts?: ProgressAssessmentLengthDiagnostic | ProgressCompletionDiagnostic): string {
    if (!facts) return prompt + PREFIX;
    let closed: ProgressAssessmentLengthDiagnostic | ProgressCompletionDiagnostic;
    if (isProgressAssessmentLengthDiagnostic(facts)) closed = facts;
    else closed = normalizeProgressCompletionDiagnostic(facts);
    return prompt + PREFIX + FACTS + JSON.stringify(closed) + SUFFIX;
}

export function reservedCompactProgressAssessmentPrompt(prompt: string): string {
    return prompt + PREFIX + FACTS + ' '.repeat(COMPACT_PROGRESS_HINT_MAX_BYTES) + SUFFIX;
}
