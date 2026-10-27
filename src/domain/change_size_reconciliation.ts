export const CHANGE_SIZE_OPERATIONS = Object.freeze([
    'calculate-size', 'issue-labels', 'issue-project-size', 'list-pull-requests',
    'pr-label-read', 'pr-label-write', 'pr-project-membership', 'pr-project-size',
] as const);

export type ChangeSizeOperation = typeof CHANGE_SIZE_OPERATIONS[number];

/** Only bounded identifiers and closed operation names cross the public error boundary. */
export interface ChangeSizeReconciliationFacts {
    readonly operation: ChangeSizeOperation;
    readonly issueNumber: number;
    readonly targetNumber: number;
    /** One-based configured Project position; zero means no Project operation. */
    readonly projectIndex: number;
    readonly verifiedOperations: number;
    readonly pendingProjectSizes: number;
    readonly providerStatus: string;
    readonly providerReference: string;
}

export function isChangeSizeReconciliationFacts(value: Readonly<Record<string, unknown>>): boolean {
    return CHANGE_SIZE_OPERATIONS.some(operation => operation === value.operation)
        && [value.issueNumber, value.targetNumber].every(number => Number.isSafeInteger(number) && Number(number) > 0)
        && [value.projectIndex, value.verifiedOperations, value.pendingProjectSizes]
            .every(number => Number.isSafeInteger(number) && Number(number) >= 0)
        && typeof value.providerStatus === 'string' && /^(?:http-[1-5][0-9]{2}|http-unavailable)$/u.test(value.providerStatus)
        && typeof value.providerReference === 'string' && /^[A-Za-z0-9:-]{1,64}$/u.test(value.providerReference);
}
