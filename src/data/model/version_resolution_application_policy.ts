import { hotfixBranch, hotfixOriginBranch, releaseBranch } from './branch_state_policy';

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

export function applyReleaseResolution(
    releaseTree: string,
    version: string | undefined,
): AppliedReleaseState {
    return {
        version,
        branch: releaseBranch(releaseTree, version),
    };
}

export function applyHotfixResolution(
    hotfixTree: string,
    baseVersion: string | undefined,
    version: string | undefined,
): AppliedHotfixState {
    return {
        baseVersion,
        baseBranch: hotfixOriginBranch(baseVersion ?? ''),
        version,
        branch: hotfixBranch(hotfixTree, version),
    };
}
