import { Config } from './config';
export type { PreviousBranchState } from './previous_branch_state';
import type { PreviousBranchState } from './previous_branch_state';
export declare function restorePreviousBranchState(previous: Config | undefined, mode: 'release' | 'hotfix' | 'default', releaseTree: string, hotfixTree: string): PreviousBranchState;
