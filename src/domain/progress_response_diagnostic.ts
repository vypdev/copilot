import { AGENT_PROMPT_MAX_BYTES } from './agent_execution_plan';

export const PROGRESS_RESPONSE_PHASES = Object.freeze(['scope', 'partition', 'assessment'] as const);
export type ProgressResponsePhase = typeof PROGRESS_RESPONSE_PHASES[number];
const schemaReasons = ['json-invalid', 'schema-type', 'schema-enum', 'schema-string-short', 'schema-string-long', 'schema-number-finite',
    'schema-number-min', 'schema-number-max', 'schema-array-short', 'schema-array-long', 'schema-required', 'schema-additional',
    'response-not-object', 'output-locale-missing', 'output-locale-invalid', 'output-locale-mismatch', 'response-shape-invalid'] as const;
export const PROGRESS_RESPONSE_REASONS = Object.freeze({
    scope: Object.freeze([...schemaReasons, 'scope-incomplete', 'scope-entry-invalid', 'scope-source-id-invalid', 'scope-source-id-duplicate',
        'scope-classification-invalid', 'scope-clause-limit', 'scope-no-requirements', 'scope-budget'] as const),
    partition: Object.freeze([...schemaReasons, 'partition-shape-invalid', 'partition-id-invalid', 'partition-files-incomplete',
        'partition-file-invalid', 'partition-unit-invalid', 'partition-facts-invalid'] as const),
    assessment: Object.freeze([...schemaReasons, 'requirements-incomplete', 'progress-invalid', 'requirement-shape-invalid', 'requirement-id-invalid',
        'requirement-id-duplicate', 'scope-uncertain', 'requirement-status-invalid', 'requirement-evidence-invalid', 'requirement-summary-invalid',
        'requirement-remaining-invalid', 'requirement-evidence-mismatch', 'progress-completion-mismatch', 'assessment-text-limit'] as const),
});
export type ProgressResponseReason = typeof PROGRESS_RESPONSE_REASONS[ProgressResponsePhase][number];
export type ProgressResponseDiagnosticFacts = Readonly<{
    phase: ProgressResponsePhase;
    reason: ProgressResponseReason;
    field: string;
    requirementId: string;
    sourceLineId: string;
}>;
const fieldPatterns = Object.freeze({
    scope: /^\$(?:\.outputLocale|\.lines(?:\[(0|[1-9]\d{0,3})\](?:\.(?:id|kind))?)?)?$/u,
    partition: /^\$(?:\.outputLocale|\.partitionId|\.files(?:\[(0|[1-9]\d{0,3})\](?:\.(?:path|unitId|implemented|remaining))?)?)?$/u,
    assessment: /^\$(?:\.outputLocale|\.progress|\.requirements(?:\[(0|[1-9]\d{0,3})\](?:\.(?:id|status|evidence|summary|remaining))?)?)?$/u,
});
const maxIndex = Object.freeze({ scope: 1_023, partition: 511, assessment: 31 });
function knownId(value: unknown, prefix: string, maximum: number): value is string {
    if (typeof value !== 'string') return false;
    const match = value.match(/^([RL])([1-9]\d{0,5})$/u);
    return match !== null && match[0] === value && match[1] === prefix && Number(match[2]) <= maximum;
}
export const isProgressRequirementId = (value: unknown): value is string => knownId(value, 'R', 32);
export const isProgressSourceLineId = (value: unknown): value is string => knownId(value, 'L', AGENT_PROMPT_MAX_BYTES + 1);

export function isProgressResponseField(phase: ProgressResponsePhase, value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const match = value.match(fieldPatterns[phase]);
    return match !== null && match[0] === value && (match[1] === undefined || Number(match[1]) <= maxIndex[phase]);
}
/** Unknown model keys and oversized locations never become operator field names. */
export function safeProgressResponseField(phase: ProgressResponsePhase, value: unknown): string {
    return isProgressResponseField(phase, value) ? value : '$';
}

export function isProgressResponseDiagnosticFacts(value: unknown): value is ProgressResponseDiagnosticFacts {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const facts = value as Record<string, unknown>;
    if (Object.keys(facts).sort().join(',') !== 'field,phase,reason,requirementId,sourceLineId'
        || !PROGRESS_RESPONSE_PHASES.includes(facts.phase as ProgressResponsePhase)) return false;
    const phase = facts.phase as ProgressResponsePhase;
    if (!(PROGRESS_RESPONSE_REASONS[phase] as readonly unknown[]).includes(facts.reason) || !isProgressResponseField(phase, facts.field)) return false;
    const { requirementId, sourceLineId, field } = facts;
    if (phase === 'partition') return requirementId === 'none' && sourceLineId === 'none';
    if (phase === 'scope') return requirementId === 'none' && (sourceLineId === 'none' || (isProgressSourceLineId(sourceLineId) && field.startsWith('$.lines')));
    return (requirementId === 'none' ? sourceLineId === 'none'
        : isProgressRequirementId(requirementId) && field.startsWith('$.requirements') && (sourceLineId === 'none' || isProgressSourceLineId(sourceLineId)));
}

/** Carries bounded completed-output facts, never a raw output or exception cause. */
export class ProgressResponseContractFailure extends Error {
    readonly facts: ProgressResponseDiagnosticFacts;
    constructor(facts: ProgressResponseDiagnosticFacts) {
        super('A returned progress result violated its response contract.');
        if (!isProgressResponseDiagnosticFacts(facts)) throw new TypeError('Progress response diagnostic is invalid.');
        this.name = 'ProgressResponseContractFailure';
        this.facts = Object.freeze({ ...facts });
    }
}
