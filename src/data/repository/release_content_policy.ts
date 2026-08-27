export interface ReleaseContent {
    name: string;
    body: string;
    draft: boolean;
    prerelease: boolean;
}

export interface ReleasePayload extends ReleaseContent {
    tag_name: string;
}

export function releasePayload(tag: string, source: ReleaseContent): ReleasePayload {
    return {
        tag_name: tag,
        name: source.name,
        body: source.body,
        draft: source.draft,
        prerelease: source.prerelease,
    };
}

export function hasReleaseContent(
    release: { name?: string | null; body?: string | null },
): release is ReleaseContent {
    return Boolean(release.name && release.body);
}
