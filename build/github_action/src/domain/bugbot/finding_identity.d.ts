/**
 * Stable, provider-independent identity for a Bugbot finding. The model may
 * choose a display id, but it must not control reconciliation identity.
 */
export interface FindingIdentityInput {
    readonly file?: unknown;
    readonly line?: unknown;
    readonly title?: unknown;
    readonly description?: unknown;
    readonly suggestion?: unknown;
}
export declare function buildFindingFingerprint(finding: FindingIdentityInput): string;
