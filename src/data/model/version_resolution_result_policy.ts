export interface ReleaseResolution {
    version?: string;
    type?: string;
}

export interface HotfixResolution {
    baseVersion?: string;
    version?: string;
}

export function releaseResolutionFromPayload(payload: Record<string, unknown>): ReleaseResolution {
    return {
        version: typeof payload.releaseVersion === 'string' ? payload.releaseVersion : undefined,
        type: typeof payload.releaseType === 'string' ? payload.releaseType : undefined,
    };
}

export function hotfixResolutionFromPayload(payload: Record<string, unknown>): HotfixResolution {
    return {
        baseVersion: typeof payload.baseVersion === 'string' ? payload.baseVersion : undefined,
        version: typeof payload.hotfixVersion === 'string' ? payload.hotfixVersion : undefined,
    };
}
