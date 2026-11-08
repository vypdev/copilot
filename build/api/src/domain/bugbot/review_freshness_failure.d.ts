export type BugbotFreshnessOperation = 'get-head-sha' | 'get-source-bound-pr';
export type BugbotFreshnessDiagnostic = Readonly<{
    readonly operation: BugbotFreshnessOperation;
    readonly providerStatus: string;
    readonly providerReference: string;
    readonly reason: 'provider-request-failed' | 'response-invalid';
}>;
export declare function isBugbotFreshnessDiagnostic(value: unknown): value is BugbotFreshnessDiagnostic;
