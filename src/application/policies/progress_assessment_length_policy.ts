import { ProgressAssessmentLengthFailure, isProgressAssessmentLengthFacts, isProgressAssessmentLengthDiagnostic,
    type ProgressAssessmentLengthDiagnostic } from '../../domain/progress_assessment_length_failure';
import { isProgressResponseDiagnosticFacts, isProgressSourceLineId } from '../../domain/progress_response_diagnostic';
import type { ProgressScope, ProgressScopeAnchors } from './progress_scope_policy';
import { validateAgentOutputLocale } from './agent_output_locale_policy';
import { ApplicationError } from '../errors/application_error';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value: unknown, key: string): unknown => record(value) && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
export const PROGRESS_ASSESSMENT_LENGTH_HINT_MAX_BYTES = 256;
const PREFIX = '\n\nThe previous completed acceptance response exceeded an unchanged text bound. Return one complete replacement for the SAME pinned batch, evidence, requirement IDs and locale using the unchanged schema. Keep every summary and remaining within its existing limit; preserve missing and uncertain requirements. Do not drop entries, repeat rejected prose, invent verification or force completion. These closed measurements describe the rejected output, not implementation or execution evidence.\n[BEGIN_PREVIOUS_MODEL_LENGTH_FACTS]\n';
const SUFFIX = '\n[END_PREVIOUS_MODEL_LENGTH_FACTS]';

/** Bind current assignments and source anchors, never a host array position or returned prose. */
export function bindProgressAssessmentLength(error: unknown, schema: Record<string, unknown> | undefined, scope: ProgressScope,
    anchors: ProgressScopeAnchors, sourceLineIds: readonly string[], locale: string): ProgressAssessmentLengthDiagnostic | null {
    if (!(error instanceof ProgressAssessmentLengthFailure) || !isProgressResponseDiagnosticFacts(error.facts)) return null;
    const captured = error.detailsFor(schema);
    if (!record(captured)) return null;
    const { outputLocale, ...details } = captured;
    if (!isProgressAssessmentLengthFacts(details) || error.facts.phase !== 'assessment' || error.facts.reason !== 'schema-string-long'
        || error.facts.field !== details.field || error.facts.requirementId !== details.requirementId) return null;
    const location = details.field.match(/\[(\d+)\]\.(summary|remaining)$/u)!;
    const definition = own(own(schema, 'properties'), 'requirements'), fields = own(own(definition, 'items'), 'properties');
    const ids = own(own(fields, 'id'), 'enum'), count = scope.requirements.length, sourceLineId = anchors?.[details.requirementId];
    if (Number(location[1]) >= count || !Array.isArray(ids) || ids.length !== count || !scope.requirements.every(requirement => ids.includes(requirement.id))
        || !scope.requirements.some(requirement => requirement.id === details.requirementId)
        || own(definition, 'minItems') !== count || own(definition, 'maxItems') !== count
        || own(own(fields, location[2]), 'maxLength') !== details.maximum
        || !isProgressSourceLineId(sourceLineId) || !sourceLineIds?.includes(sourceLineId)
        || error.facts.sourceLineId !== 'none' && error.facts.sourceLineId !== sourceLineId
        || validateAgentOutputLocale({ outputLocale }, locale).kind !== 'valid') return null;
    return Object.freeze({ ...details, sourceLineId });
}

export function reservedProgressAssessmentLengthPrompt(prompt: string): string {
    return prompt + PREFIX + ' '.repeat(PROGRESS_ASSESSMENT_LENGTH_HINT_MAX_BYTES) + SUFFIX;
}
export function progressAssessmentLengthRepairPrompt(prompt: string, facts: ProgressAssessmentLengthDiagnostic): string {
    if (!isProgressAssessmentLengthDiagnostic(facts)) throw new TypeError('Progress assessment length diagnostic is invalid.');
    return prompt + PREFIX + JSON.stringify(facts) + SUFFIX;
}
export function progressAssessmentLengthRejected(facts: ProgressAssessmentLengthDiagnostic): ApplicationError {
    return new ApplicationError('agent.failed', 'A progress acceptance fact still exceeds its unchanged limit after one complete replacement; existing progress was retained.',
        { retryable: false, recovery: { id: 'progress-assessment-length-invalid', variables: facts } });
}
