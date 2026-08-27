export function shouldAbortReleaseResolution(releaseType: string | undefined): boolean {
    return releaseType === undefined || releaseType.trim().length === 0;
}
