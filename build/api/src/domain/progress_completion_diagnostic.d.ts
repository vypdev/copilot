/** Closed facts about a rejected model response, never execution or approval evidence. */
export type ProgressCompletionDiagnostic = Readonly<{
    readonly reportedProgress: number;
    readonly requirementCount: number;
    readonly supportedCount: number;
    readonly missingCount: number;
    readonly unknownCount: number;
}>;
export declare function normalizeProgressCompletionDiagnostic(value: unknown): ProgressCompletionDiagnostic;
