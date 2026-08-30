/**
 * Stable, provider-independent identity for a Bugbot finding. The model may
 * choose a display id, but it must not control reconciliation identity.
 *
 * The identity deliberately excludes the finding's prose and suggestion.
 * Providers often rephrase those fields between runs even when the underlying
 * issue is unchanged. Including them would turn harmless wording changes into
 * duplicate comments and would make resolution reconciliation unreliable.
 */
export interface FindingIdentityInput {
    readonly file?: unknown;
    readonly line?: unknown;
    readonly title?: unknown;
    readonly description?: unknown;
    readonly suggestion?: unknown;
}
export declare function buildFindingFingerprint(finding: FindingIdentityInput): string;
