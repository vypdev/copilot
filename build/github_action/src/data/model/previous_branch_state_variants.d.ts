import type { Config } from './config';
import type { PreviousBranchState } from './previous_branch_state';
export declare function restoreReleaseState(previous: Config | undefined, releaseTree: string): PreviousBranchState;
export declare function restoreHotfixState(previous: Config | undefined, hotfixTree: string): PreviousBranchState;
export declare function restoreDefaultState(previous: Config | undefined): PreviousBranchState;
