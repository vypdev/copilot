/** Closed invocation-only review capacity. No caller-supplied limit can expand it. */
export const BUGBOT_FRAMED_LIMITS = Object.freeze({
    files: 1_000, fragments: 4_096, rawUtf16: 8_192_000, normalizedUtf16: 8_192_000,
    fragmentUtf16: 12_000, partitionUtf16: 64_000, renderedUtf16: 8_192_000,
    partitions: 128, frames: 2, framePartitions: 64, promptBytes: 512 * 1024,
    promptTotalBytes: 32 * 1024 * 1024, responseBytes: 4 * 1024 * 1024,
    resultBytes: 16 * 1024 * 1024, findingsPerResponse: 200, findings: 2_000,
    resolutions: 500, recoveredFiles: 64, recoveredPatchBytes: 2 * 1024 * 1024,
    recoveredPatchTotalBytes: 8 * 1024 * 1024, blobBytes: 4 * 1024 * 1024,
    blobTotalBytes: 32 * 1024 * 1024, gitReads: 256,
});
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
export class BugbotReviewCompletenessError extends Error {
    readonly facts: BugbotReviewBlockFacts;
    constructor(resource: BugbotReviewBlockReason, observed: number = 1, limit: number = 0,
        unit: BugbotReviewCountUnit = bugbotReviewResourceUnit(resource), countKind: 'exact' | 'at-least' = 'exact') {
        super(`Complete Bugbot review blocked (${resource}: ${countKind === 'at-least' ? '≥' : '='} ${observed} ${unit}; limit ${limit}). No findings were published.`);
        this.name = 'BugbotReviewCompletenessError';
        this.facts = Object.freeze({ profile: 'framed-v1', countKind, resource, observed, limit, unit });
    }
}

export function enforceBugbotFramedBudget(resource: BugbotFramedResource, observed: number): void {
    const unit = bugbotReviewResourceUnit(resource);
    if (!Number.isSafeInteger(observed) || observed < 0) throw new BugbotReviewCompletenessError('source');
    if (observed > BUGBOT_FRAMED_LIMITS[resource]) {
        throw new BugbotReviewCompletenessError(resource, observed, BUGBOT_FRAMED_LIMITS[resource], unit);
    }
}

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

export interface BugbotReviewGitEntry { readonly mode: '100644' | '100755'; readonly oid: string }

export interface BugbotFramedChange {
    readonly git?: { readonly old?: BugbotReviewGitEntry; readonly current?: BugbotReviewGitEntry };
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

export function isBugbotReviewBlockFacts(value: object): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const facts = value as Readonly<Record<string, unknown>>;
    const reasons = [...Object.keys(BUGBOT_FRAMED_LIMITS), 'source', 'identity', 'manifest', 'coverage', 'receipt', 'capability'];
    return Object.keys(facts).sort().join(',') === 'countKind,limit,observed,profile,resource,unit'
        && facts.profile === 'framed-v1' && ['exact', 'at-least'].includes(facts.countKind as string) && reasons.includes(facts.resource as string)
        && [facts.observed, facts.limit].every(x => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0)
        && facts.unit === bugbotReviewResourceUnit(facts.resource as string)
        && (!(facts.resource as string in BUGBOT_FRAMED_LIMITS) || (facts.limit as number) <= BUGBOT_FRAMED_LIMITS[facts.resource as BugbotFramedResource]);
}

function bugbotReviewResourceUnit(resource: string): BugbotReviewCountUnit {
    return resource.endsWith('Utf16') ? 'UTF-16 code units'
        : resource.endsWith('Bytes') ? 'UTF-8 bytes' : resource === 'gitReads' ? 'operations' : 'items';
}
