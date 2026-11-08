export type BugbotFreshnessOperation = 'get-head-sha' | 'get-source-bound-pr';
export type BugbotFreshnessDiagnostic = Readonly<{
    readonly operation: BugbotFreshnessOperation;
    readonly providerStatus: string;
    readonly providerReference: string;
    readonly reason: 'provider-request-failed' | 'response-invalid';
}>;
export function isBugbotFreshnessDiagnostic(value: unknown): value is BugbotFreshnessDiagnostic {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const v = value as Record<string, unknown>;
    return (v.operation === 'get-head-sha' || v.operation === 'get-source-bound-pr')
        && typeof v.providerStatus === 'string' && /^(?:http-unavailable|http-[45][0-9]{2})$/u.test(v.providerStatus)
        && typeof v.providerReference === 'string' && /^[A-Za-z0-9:-]{1,64}$/u.test(v.providerReference)
        && (v.reason === 'provider-request-failed' || v.reason === 'response-invalid')
        && (v.reason !== 'response-invalid' || v.providerStatus === 'http-unavailable');
}
