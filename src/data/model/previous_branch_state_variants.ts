import type { Config } from './config';
import {
    hotfixBranch,
    hotfixOriginBranch,
    releaseBranch,
    versionFromHotfixOriginBranch,
    versionFromReleaseBranch,
} from './branch_state_policy';
import type { PreviousBranchState } from './previous_branch_state';

export function restoreReleaseState(previous: Config | undefined, releaseTree: string): PreviousBranchState {
    if (!previous?.releaseBranch) return {};
    const releaseVersion = versionFromReleaseBranch(previous.releaseBranch);
    return {
        releaseVersion,
        releaseBranch: releaseBranch(releaseTree, releaseVersion),
        parentBranch: previous.parentBranch,
    };
}

export function restoreHotfixState(previous: Config | undefined, hotfixTree: string): PreviousBranchState {
    const hotfixBaseVersion = previous?.hotfixOriginBranch
        ? versionFromHotfixOriginBranch(previous.hotfixOriginBranch)
        : undefined;
    const hotfixVersion = previous?.hotfixBranch
        ? versionFromReleaseBranch(previous.hotfixBranch)
        : undefined;
    return {
        hotfixBaseVersion,
        hotfixBaseBranch: hotfixBaseVersion ? hotfixOriginBranch(hotfixBaseVersion) : undefined,
        hotfixVersion,
        hotfixBranch: hotfixVersion ? hotfixBranch(hotfixTree, hotfixVersion) : undefined,
        parentBranch: hotfixBaseVersion ? hotfixOriginBranch(hotfixBaseVersion) : undefined,
    };
}

export function restoreDefaultState(previous: Config | undefined): PreviousBranchState {
    return {
        parentBranch: previous?.parentBranch,
        workingBranch: previous?.workingBranch,
    };
}
