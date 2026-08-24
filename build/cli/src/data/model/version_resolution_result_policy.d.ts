export interface ReleaseResolution {
    version?: string;
    type?: string;
}
export interface HotfixResolution {
    baseVersion?: string;
    version?: string;
}
export declare function releaseResolutionFromPayload(payload: Record<string, unknown>): ReleaseResolution;
export declare function hotfixResolutionFromPayload(payload: Record<string, unknown>): HotfixResolution;
