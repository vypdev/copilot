import { isProgressRequirementId, isProgressSourceLineId } from './progress_response_diagnostic';

export type ProgressCitationRepetitionDiagnostic = Readonly<{
    requirementId: string;
    sourceLineId: string;
    batch: number;
    citationCount: number;
    distinctCount: number;
}>;

/** Closed host measurements only; neither source references nor rejected prose are retained. */
export function isProgressCitationRepetitionDiagnostic(value: unknown): value is ProgressCitationRepetitionDiagnostic {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const facts = value as Record<string, unknown>;
    return Object.keys(facts).sort().join(',') === 'batch,citationCount,distinctCount,requirementId,sourceLineId'
        && isProgressRequirementId(facts.requirementId) && isProgressSourceLineId(facts.sourceLineId)
        && Number.isSafeInteger(facts.batch) && (facts.batch as number) >= 1 && (facts.batch as number) <= 1024
        && Number.isSafeInteger(facts.citationCount) && (facts.citationCount as number) >= 2 && (facts.citationCount as number) <= 8
        && Number.isSafeInteger(facts.distinctCount) && (facts.distinctCount as number) >= 1
        && (facts.distinctCount as number) < (facts.citationCount as number);
}
