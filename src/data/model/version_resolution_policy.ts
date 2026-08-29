import { incrementVersion, DEFAULT_BASE_VERSION } from './version_policy';

export function nextReleaseVersion(
    latestTag: string | undefined,
    releaseType: string,
): string {
    return incrementVersion(latestTag ?? DEFAULT_BASE_VERSION, releaseType);
}

export function nextHotfixVersion(latestTag: string | undefined): {
    baseVersion: string;
    version: string;
} {
    const baseVersion = latestTag ?? DEFAULT_BASE_VERSION;
    return {
        baseVersion,
        version: incrementVersion(baseVersion, 'Patch'),
    };
}
