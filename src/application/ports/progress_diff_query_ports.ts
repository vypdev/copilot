/** Immutable repository comparison supplied by trusted code; no workspace or mutation capabilities. */
export interface ProgressDiffPartition {
    readonly id: string;
    readonly paths: readonly string[];
    readonly units?: readonly { readonly id: string; readonly path: string; readonly content?: Readonly<Record<string, unknown>> }[];
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

export interface ProgressDiffChange {
    readonly path: string;
    readonly status: string;
    readonly additions: number;
    readonly deletions: number;
    readonly patch?: string;
    readonly evidence?: 'generated-metadata-only';
    readonly unitId?: string;
    readonly recoveredContent?: Readonly<Record<string, unknown>>;
}
