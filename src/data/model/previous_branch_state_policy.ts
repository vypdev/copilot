import { Config } from './config';
import { restoreDefaultState, restoreHotfixState, restoreReleaseState } from './previous_branch_state_variants';
export type { PreviousBranchState } from './previous_branch_state';
import type { PreviousBranchState } from './previous_branch_state';

export function restorePreviousBranchState(
    previous: Config | undefined,
    mode: 'release' | 'hotfix' | 'default',
    releaseTree: string,
    hotfixTree: string,
): PreviousBranchState {
    if (mode === 'release') return previous?.releaseBranch
        ? restoreReleaseState(previous, releaseTree)
        : restoreDefaultState(previous);
    if (mode === 'hotfix') return restoreHotfixState(previous, hotfixTree);
    return restoreDefaultState(previous);
}
