import { Branches } from '../data/model/branches';
export interface BranchValues {
    main: string;
    defaultBranch: string;
    development: string;
    featureTree: string;
    bugfixTree: string;
    hotfixTree: string;
    releaseTree: string;
    docsTree: string;
    choreTree: string;
}
export declare function buildBranches(values: BranchValues): Branches;
