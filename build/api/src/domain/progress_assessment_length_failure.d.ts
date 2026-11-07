import { ProgressResponseContractFailure, type ProgressResponseDiagnosticFacts } from './progress_response_diagnostic';
export type ProgressAssessmentLengthFacts = Readonly<{
    requirementId: string;
    field: string;
    maximum: number;
    observed: number;
}>;
export type ProgressAssessmentLengthContext = ProgressAssessmentLengthFacts & Readonly<{
    outputLocale: string;
}>;
export type ProgressAssessmentLengthDiagnostic = ProgressAssessmentLengthFacts & Readonly<{
    sourceLineId: string;
}>;
/** Completed native output supplied these closed measurements; the application still owns binding. */
export declare class ProgressAssessmentLengthFailure extends ProgressResponseContractFailure {
    #private;
    constructor(facts: ProgressResponseDiagnosticFacts, details: ProgressAssessmentLengthContext, schema: object);
    detailsFor(schema: object | undefined): ProgressAssessmentLengthContext | undefined;
}
export declare function isProgressAssessmentLengthFacts(value: unknown): value is ProgressAssessmentLengthFacts;
export declare function isProgressAssessmentLengthDiagnostic(value: unknown): value is ProgressAssessmentLengthDiagnostic;
