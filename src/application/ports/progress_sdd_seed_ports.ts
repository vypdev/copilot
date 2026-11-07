export interface ProgressSddSeedRequest {
    readonly issueNumber: number;
    readonly issueBody: string;
    readonly issueKind?: string;
    readonly profileDigest?: string;
    readonly trustedBotLogin?: string;
    readonly branch: string;
    readonly headSha: string;
    readonly seed: string;
    readonly seedHash: string;
}

export interface ProgressSddPublication {
    readonly issueUrl: string;
    readonly cardId: number;
    readonly path: string;
    readonly commitSha: string;
    readonly artifactHash: string;
}

export type ProgressSddSeedQuery = (request: ProgressSddSeedRequest) => Promise<ProgressSddPublication>;
