/** Closed invocation-only review capacity. No caller-supplied limit can expand it. */
export declare const BUGBOT_FRAMED_LIMITS: Readonly<{
    files: 1000;
    fragments: 4096;
    rawUtf16: 8192000;
    normalizedUtf16: 8192000;
    fragmentUtf16: 12000;
    partitionUtf16: 64000;
    renderedUtf16: 8192000;
    partitions: 128;
    frames: 2;
    framePartitions: 64;
    promptBytes: number;
    promptTotalBytes: number;
    responseBytes: number;
    resultBytes: number;
    findingsPerResponse: 200;
    findings: 2000;
    resolutions: 500;
    recoveredFiles: 64;
    recoveredPatchBytes: number;
    recoveredPatchTotalBytes: number;
    blobBytes: number;
    blobTotalBytes: number;
    gitReads: 256;
}>;
export type BugbotFramedResource = keyof typeof BUGBOT_FRAMED_LIMITS;
export type BugbotReviewBlockReason = BugbotFramedResource | 'source' | 'identity' | 'manifest' | 'coverage' | 'receipt' | 'capability';
export type BugbotReviewCountUnit = 'UTF-16 code units' | 'UTF-8 bytes' | 'items' | 'operations';
export interface BugbotReviewBlockFacts {
    readonly profile: 'framed-v1';
    readonly countKind: 'exact' | 'at-least';
    readonly resource: BugbotReviewBlockReason;
    readonly observed: number;
    readonly limit: number;
    readonly unit: BugbotReviewCountUnit;
}
/** Content-free deterministic failure, mapped to localized semantic errors by the application. */
export declare class BugbotReviewCompletenessError extends Error {
    readonly facts: BugbotReviewBlockFacts;
    constructor(resource: BugbotReviewBlockReason, observed?: number, limit?: number, unit?: BugbotReviewCountUnit, countKind?: 'exact' | 'at-least');
}
export declare function enforceBugbotFramedBudget(resource: BugbotFramedResource, observed: number): void;
export interface BugbotFramedReviewIdentity {
    readonly owner: string;
    readonly repository: string;
    readonly repositoryId?: number;
    readonly pullRequestNumber: number;
    readonly baseRef: string;
    readonly baseSha: string;
    readonly headOwner: string;
    readonly headRepository: string;
    readonly headRef: string;
    readonly headSha: string;
    readonly mergeBaseSha: string;
}
export interface BugbotReviewGitEntry {
    readonly mode: '100644' | '100755';
    readonly oid: string;
}
export interface BugbotFramedChange {
    readonly git?: {
        readonly old?: BugbotReviewGitEntry;
        readonly current?: BugbotReviewGitEntry;
    };
    readonly filename: string;
    readonly previousFilename?: string;
    readonly status: string;
    readonly additions: number;
    readonly deletions: number;
    readonly patch: string;
    readonly source: 'provider' | 'local-git';
}
export interface BugbotFramedReviewSource {
    readonly identity: BugbotFramedReviewIdentity;
    readonly changes: readonly BugbotFramedChange[];
    readonly complete: boolean;
    /** Content-free measured source work; never a substitute for immutable coverage proof. */
    readonly metrics?: {
        readonly gitReads: number;
        readonly verifiedBlobs: number;
        readonly verifiedBlobBytes: number;
        readonly recoveredFiles: number;
        readonly recoveredPatchBytes: number;
    };
}
/** A receipt binds every fragment in one exact partition to its source and invocation. */
export interface BugbotFramedAssignment {
    readonly profile: 'framed-v1';
    readonly manifestDigest: string;
    readonly frameId: string;
    readonly frameOrdinal: number;
    readonly frameTotal: number;
    readonly baseSha: string;
    readonly fragmentIds: readonly string[];
    readonly coverageDigest: string;
}
export declare function isBugbotReviewBlockFacts(value: object): boolean;
