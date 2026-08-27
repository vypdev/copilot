export interface AppliedReleaseState {
    version?: string;
    branch: string;
}
export interface AppliedHotfixState {
    baseVersion?: string;
    baseBranch: string;
    version?: string;
    branch: string;
}
export declare function applyReleaseResolution(releaseTree: string, version: string | undefined): AppliedReleaseState;
export declare function applyHotfixResolution(hotfixTree: string, baseVersion: string | undefined, version: string | undefined): AppliedHotfixState;
