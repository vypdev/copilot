export interface ExistingRelease {
    id: number;
}

export function findTargetRelease<T extends ExistingRelease>(
    releases: T[],
    targetTag: string,
    tagOf: (release: T) => string,
): T | undefined {
    return releases.find((release) => tagOf(release) === targetTag);
}

export function releaseIdAsString(id: number): string {
    return id.toString();
}
