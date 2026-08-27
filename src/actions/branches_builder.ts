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

export function buildBranches(values: BranchValues): Branches {
    return new Branches(
        values.main,
        values.defaultBranch,
        values.development,
        values.featureTree,
        values.bugfixTree,
        values.hotfixTree,
        values.releaseTree,
        values.docsTree,
        values.choreTree,
    );
}
