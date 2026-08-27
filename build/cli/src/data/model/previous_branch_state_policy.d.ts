import { Config } from './config';
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
export declare function restorePreviousBranchState(previous: Config | undefined, mode: 'release' | 'hotfix' | 'default', releaseTree: string, hotfixTree: string): PreviousBranchState;
