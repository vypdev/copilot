export const COPILOT_EVIDENCE_FAILURE_CODES = Object.freeze([
    'authorization.credential-invalid', 'authorization.denied', 'provider.rate-limited',
    'provider.not-found', 'provider.contract-invalid', 'provider.conflict', 'provider.unavailable', 'unexpected',
] as const);
export type CopilotEvidenceFailureCode = typeof COPILOT_EVIDENCE_FAILURE_CODES[number];

/** Closed provider facts. Neither SDK bodies, credentials nor the original exception cross this port. */
export class CopilotEvidencePublicationError extends Error {
    readonly code: CopilotEvidenceFailureCode;
    readonly status: number | undefined;
    readonly providerReference: string | undefined;
    constructor(code: CopilotEvidenceFailureCode, status?: unknown, providerReference?: unknown) {
        super('Optional Check Run publication was not confirmed.');
        this.name = 'CopilotEvidencePublicationError';
        this.code = COPILOT_EVIDENCE_FAILURE_CODES.includes(code) ? code : 'unexpected';
        this.status = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
        this.providerReference = typeof providerReference === 'string' && providerReference.length <= 64
            && /^[a-f0-9]+(?::[a-f0-9]+){1,7}$/iu.test(providerReference) ? providerReference : undefined;
        Object.freeze(this);
    }
}
