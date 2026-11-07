import { ProgressResponseContractFailure, isProgressRequirementId, isProgressResponseField, isProgressSourceLineId,
    type ProgressResponseDiagnosticFacts } from './progress_response_diagnostic';

export type ProgressAssessmentLengthFacts = Readonly<{
    requirementId: string;
    field: string;
    maximum: number;
    observed: number;
}>;
export type ProgressAssessmentLengthContext = ProgressAssessmentLengthFacts & Readonly<{ outputLocale: string }>;
export type ProgressAssessmentLengthDiagnostic = ProgressAssessmentLengthFacts & Readonly<{ sourceLineId: string }>;

/** Completed native output supplied these closed measurements; the application still owns binding. */
export class ProgressAssessmentLengthFailure extends ProgressResponseContractFailure {
    readonly #details: ProgressAssessmentLengthContext;
    readonly #schema: object;
    constructor(facts: ProgressResponseDiagnosticFacts, details: ProgressAssessmentLengthContext, schema: object) {
        super(facts); this.#details = Object.freeze({ ...details }); this.#schema = schema;
    }
    detailsFor(schema: object | undefined): ProgressAssessmentLengthContext | undefined {
        return #schema in this && schema === this.#schema ? this.#details : undefined;
    }
}

export function isProgressAssessmentLengthFacts(value: unknown): value is ProgressAssessmentLengthFacts {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const facts = value as Record<string, unknown>;
    return Object.keys(facts).sort().join(',') === 'field,maximum,observed,requirementId'
        && isProgressRequirementId(facts.requirementId) && isProgressResponseField('assessment', facts.field)
        && /\.(?:summary|remaining)$/u.test(facts.field)
        && typeof facts.maximum === 'number' && Number.isSafeInteger(facts.maximum) && facts.maximum >= 1 && facts.maximum <= 800
        && typeof facts.observed === 'number' && Number.isSafeInteger(facts.observed) && facts.observed > facts.maximum;
}

export function isProgressAssessmentLengthDiagnostic(value: unknown): value is ProgressAssessmentLengthDiagnostic {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const { sourceLineId, ...facts } = value as Record<string, unknown>;
    return isProgressSourceLineId(sourceLineId) && isProgressAssessmentLengthFacts(facts);
}
