export type ProgressEvidenceProfile = 'framed-v1' | 'immutable-tree-v1';
/** Immutable repository comparison supplied by trusted code; no workspace or mutation capabilities. */
export interface ProgressRecoveryCounters {
    readonly files: number;
    readonly bytes: number;
    readonly requests: number;
    readonly treeEntries: number;
}
export interface ProgressRecoveryUsage {
    readonly frames: number;
    readonly current: ProgressRecoveryCounters;
    readonly total: ProgressRecoveryCounters;
}
export interface ProgressPartSourceIdentity {
    readonly id: string;
    readonly digest: string;
    readonly ordinal: number;
    readonly total: number;
}
export interface ProgressEvidenceProtocol {
    readonly version: ProgressEvidenceProfile;
    readonly attemptId: string;
    readonly preimageSha: string;
    readonly sourcesDigest: string;
    readonly manifestDigest: string;
    readonly requiredPaths: readonly string[];
    readonly unitCount: number;
    readonly recovery: ProgressRecoveryUsage | null;
    readonly assessmentContextDigest?: string;
}

export interface ProgressDiffPartition {
    readonly id: string;
    readonly paths: readonly string[];
    readonly units?: readonly { readonly id: string; readonly path: string; readonly content?: Readonly<Record<string, unknown>> }[];
    readonly evidence: string;
    readonly sourceIdentity?: ProgressPartSourceIdentity;
}
interface ProgressDiffIdentity {
    readonly baseSha: string;
    readonly headSha: string;
    readonly evidence: string;
}
export type ProgressDiffEvidence = ProgressDiffIdentity & (
    | { readonly kind: 'single' }
    | { readonly kind: 'partitioned'; readonly partitions: readonly ProgressDiffPartition[]; readonly protocol?: ProgressEvidenceProtocol }
);
export interface BoundProgressDiffQueryPort {
    getDiff(baseSha: string, headSha: string): Promise<ProgressDiffEvidence>;
}

interface ProgressDiffChangeContent {
    readonly path: string;
    readonly status: string;
    readonly patch?: string;
    readonly evidence?: 'generated-metadata-only';
    readonly unitId?: string;
    readonly recoveredContent?: Readonly<Record<string, unknown>>;
}

/** Tree evidence has complete contents but no invented provider line statistics. */
export type ProgressDiffChange = ProgressDiffChangeContent & (
    | { readonly additions: number; readonly deletions: number; readonly statistics?: never }
    | { readonly statistics: 'immutable-content-only'; readonly additions?: never; readonly deletions?: never }
);
