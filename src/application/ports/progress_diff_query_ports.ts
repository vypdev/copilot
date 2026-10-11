/** Immutable repository comparison supplied by trusted code; no workspace or mutation capabilities. */
export interface ProgressDiffEvidence {
    readonly baseSha: string;
    readonly headSha: string;
    readonly evidence: string;
}
export interface BoundProgressDiffQueryPort {
    getDiff(baseSha: string, headSha: string): Promise<ProgressDiffEvidence>;
}
