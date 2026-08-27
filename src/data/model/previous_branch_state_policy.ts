import { Config } from './config';
import {
    hotfixBranch,
    hotfixOriginBranch,
    releaseBranch,
    versionFromHotfixOriginBranch,
    versionFromReleaseBranch,
} from './branch_state_policy';

export interface PreviousBranchState {
    releaseVersion?: string;
    releaseBranch?: string;
    parentBranch?: string;
    hotfixBaseVersion?: string;
    hotfixBaseBranch?: string;
    hotfixVersion?: string;
    hotfixBranch?: string;
    workingBranch?: string;
}

export function restorePreviousBranchState(
    previous: Config | undefined,
    mode: 'release' | 'hotfix' | 'default',
    releaseTree: string,
    hotfixTree: string,
): PreviousBranchState {
    if (mode === 'release' && previous?.releaseBranch) {
        const releaseVersion = versionFromReleaseBranch(previous.releaseBranch);
        return {
            releaseVersion,
            releaseBranch: releaseBranch(releaseTree, releaseVersion),
            parentBranch: previous.parentBranch,
        };
    }

    if (mode === 'hotfix') {
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

    return {
        parentBranch: previous?.parentBranch,
        workingBranch: previous?.workingBranch,
    };
}
