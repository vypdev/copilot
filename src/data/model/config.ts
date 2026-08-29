import {BranchConfiguration} from "./branch_configuration";
import {isRecommendationState, RecommendationState} from "./recommendation_state";
import {Result} from "./result";

export class Config {
    branchType: string;
    releaseBranch: string | undefined;
    workingBranch: string | undefined;
    parentBranch: string | undefined;
    hotfixOriginBranch: string | undefined;
    hotfixBranch: string | undefined;
    results: Result[] = [];
    branchConfiguration: BranchConfiguration | undefined;
    recommendationState: RecommendationState | undefined;

    /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- config from API */
    constructor(data: any) {
        this.branchType = data['branchType'] ?? '';
        this.hotfixOriginBranch = data['hotfixOriginBranch'];
        this.hotfixBranch = data['hotfixBranch'];
        this.releaseBranch = data['releaseBranch'];
        this.parentBranch = data['parentBranch'];
        this.workingBranch = data['workingBranch'];
        if (data['branchConfiguration'] !== undefined) {
            this.branchConfiguration = new BranchConfiguration(data['branchConfiguration']);
        }
        if (isRecommendationState(data['recommendationState'])) {
            this.recommendationState = data['recommendationState'];
        }
    }
}
