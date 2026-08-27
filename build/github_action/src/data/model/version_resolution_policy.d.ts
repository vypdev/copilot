export declare function nextReleaseVersion(latestTag: string | undefined, releaseType: string): string;
export declare function nextHotfixVersion(latestTag: string | undefined): {
    baseVersion: string;
    version: string;
};
