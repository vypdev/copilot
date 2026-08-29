import { BranchConfiguration } from "./branch_configuration";
import { RecommendationState } from "./recommendation_state";
import { Result } from "./result";
export declare class Config {
    branchType: string;
    releaseBranch: string | undefined;
    workingBranch: string | undefined;
    parentBranch: string | undefined;
    hotfixOriginBranch: string | undefined;
    hotfixBranch: string | undefined;
    results: Result[];
    branchConfiguration: BranchConfiguration | undefined;
    recommendationState: RecommendationState | undefined;
    constructor(data: any);
}
