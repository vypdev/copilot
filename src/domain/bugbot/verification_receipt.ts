/** Trusted installation policy. Shadow alone cannot mint an approval receipt. */
export interface BugbotVerificationAuthority {
    readonly mode: 'enforced' | 'disabled' | 'shadow';
    readonly policyDigest: string;
    readonly generation: number;
    readonly workflowId: number;
    readonly sourceAppId: number;
}

export const BUGBOT_VERIFICATION_RECEIPT_MARKER = 'copilot-bugbot-verification:v1';
export const BUGBOT_RECEIPT_COUNT_KEYS = [
    'open', 'reopened', 'dismissed', 'verificationRequired', 'unknown', 'fixed', 'obsolete',
] as const;
export type BugbotReceiptCounts = Readonly<Record<typeof BUGBOT_RECEIPT_COUNT_KEYS[number], number>>;

export interface BugbotVerificationPublication {
    readonly authority: BugbotVerificationAuthority;
    readonly repositoryId: number;
    readonly pullNumber: number;
    readonly headSha: string;
    readonly baseSha: string;
    readonly coverage: 'complete';
    /** All evidence required by the effective policy is complete. */
    readonly verification: 'complete';
    readonly publication: 'verified';
    readonly outcome: 'complete';
    readonly findingStates: BugbotReceiptCounts;
}
