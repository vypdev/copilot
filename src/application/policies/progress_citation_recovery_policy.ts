import { isDeepStrictEqual } from 'node:util';
import { isProgressCitationRepetitionDiagnostic, type ProgressCitationRepetitionDiagnostic } from '../../domain/progress_citation_repetition';
import type { ProgressScope, ProgressScopeAnchors } from './progress_scope_policy';
import { compactProgressAssessmentPlan } from './progress_compact_assessment_policy';
import { progressBatchRejected } from './progress_batch_rejection_policy';
import type { ApplicationError } from '../errors/application_error';

interface NativeRepetition {
    readonly schema: Record<string, unknown>;
    readonly scope: ProgressScope;
    readonly anchors: ProgressScopeAnchors;
    readonly locale: string;
    readonly facts: ProgressCitationRepetitionDiagnostic;
}
const nativeRepetitions = new WeakMap<object, NativeRepetition>();
export const PROGRESS_CITATION_HINT_MAX_BYTES = 256;
const PREFIX = '\n\nThe previous completed assessment repeated a source citation. Return one complete replacement for the SAME pinned batch, original requirement IDs, evidence dictionary, locale and unchanged schema. Each citations array must contain one to eight DISTINCT admitted source IDs. Preserve the complete original evidence inventory; do not invent references, infer verification, force completion or omit requirements. These closed measurements describe the rejected response, not implementation or execution evidence.\n[BEGIN_PREVIOUS_CITATION_REPETITION]\n';
const SUFFIX = '\n[END_PREVIOUS_CITATION_REPETITION]';

function freezeSnapshot<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freezeSnapshot);
    }
    return value;
}

/** Only the native receipt validator mints this invocation-local origin; public error fields cannot forge it. */
export function progressCitationRepetitionError(schema: Record<string, unknown>, scope: ProgressScope, anchors: ProgressScopeAnchors,
    locale: string, facts: ProgressCitationRepetitionDiagnostic, requestSchema?: Record<string, unknown>): ApplicationError {
    const valid = isProgressCitationRepetitionDiagnostic(facts);
    const error = progressBatchRejected('evidence-duplicate', valid ? { batch: facts.batch, requirementId: facts.requirementId } : {});
    if (!valid || !requestSchema || !Object.isFrozen(requestSchema)) return error;
    try {
        const captured = structuredClone({ scope, anchors, locale, facts });
        const canonical = structuredClone(schema), actual = structuredClone(requestSchema);
        const compact = compactProgressAssessmentPlan(canonical, locale);
        if (!isDeepStrictEqual(canonical, actual) && (!compact || !isDeepStrictEqual(structuredClone(compact.schema), actual))) return error;
        nativeRepetitions.set(error, Object.freeze({ ...freezeSnapshot(captured), schema: requestSchema }));
    } catch { /* Unknown contracts never acquire recovery authority. */ }
    return error;
}

/** Bind complete native request and scope snapshots, not exception names or model-echoed metadata. */
export function bindProgressCitationRepetition(error: unknown, schema: Record<string, unknown> | undefined, scope: ProgressScope,
    anchors: ProgressScopeAnchors, sourceLineIds: readonly string[], locale: string): ProgressCitationRepetitionDiagnostic | null {
    if (!error || typeof error !== 'object') return null;
    const captured = nativeRepetitions.get(error);
    if (!captured || captured.locale !== locale || captured.schema !== schema
        || !isDeepStrictEqual(captured.scope, scope) || !isDeepStrictEqual(captured.anchors, anchors)
        || !sourceLineIds?.includes(captured.facts.sourceLineId)) return null;
    return captured.facts;
}

/** Planning only: an unrelated legacy schema does not reserve a citation correction it cannot produce. */
export function hasProgressCitationsSchema(schema: Record<string, unknown>): boolean {
    const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const properties = schema.properties, requirements = record(properties) ? properties.requirements : undefined;
    const items = record(requirements) ? requirements.items : undefined, fields = record(items) ? items.properties : undefined;
    return record(fields) && record(fields.citations);
}

export function reservedProgressCitationPrompt(prompt: string): string {
    return prompt + PREFIX + ' '.repeat(PROGRESS_CITATION_HINT_MAX_BYTES) + SUFFIX;
}
export function progressCitationRepairPrompt(prompt: string, facts: ProgressCitationRepetitionDiagnostic): string {
    if (!isProgressCitationRepetitionDiagnostic(facts)) throw new TypeError('Progress citation repetition diagnostic is invalid.');
    return prompt + PREFIX + JSON.stringify(facts) + SUFFIX;
}
