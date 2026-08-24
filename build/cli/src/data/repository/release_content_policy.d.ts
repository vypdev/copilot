export interface ReleaseContent {
    name: string;
    body: string;
    draft: boolean;
    prerelease: boolean;
}
export interface ReleasePayload extends ReleaseContent {
    tag_name: string;
}
export declare function releasePayload(tag: string, source: ReleaseContent): ReleasePayload;
export declare function hasReleaseContent(release: {
    name?: string | null;
    body?: string | null;
}): release is ReleaseContent;
