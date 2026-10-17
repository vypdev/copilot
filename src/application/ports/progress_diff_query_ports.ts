/** Immutable repository comparison supplied by trusted code; no workspace or mutation capabilities. */
export interface ProgressDiffPartition {
    readonly id: string;
    readonly paths: readonly string[];
    readonly evidence: string;
}
interface ProgressDiffIdentity {
    readonly baseSha: string;
    readonly headSha: string;
    readonly evidence: string;
}
export type ProgressDiffEvidence = ProgressDiffIdentity & (
    | { readonly kind: 'single' }
    | { readonly kind: 'partitioned'; readonly partitions: readonly ProgressDiffPartition[] }
);
export interface BoundProgressDiffQueryPort {
    getDiff(baseSha: string, headSha: string): Promise<ProgressDiffEvidence>;
}
