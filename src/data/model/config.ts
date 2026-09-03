import {BranchConfiguration} from "./branch_configuration";
import {isRecommendationState, RecommendationState} from "./recommendation_state";
import {Result} from "./result";
import { asModelInput, readOptionalString, readString } from './model_input';

export const CONFIG_SCHEMA_VERSION = 1;

export class Config {
    readonly schemaVersion: number;
    branchType: string;
    releaseBranch: string | undefined;
    workingBranch: string | undefined;
    parentBranch: string | undefined;
    hotfixOriginBranch: string | undefined;
    hotfixBranch: string | undefined;
    results: Result[] = [];
    branchConfiguration: BranchConfiguration | undefined;
    recommendationState: RecommendationState | undefined;

    constructor(data: unknown) {
        const input = asModelInput(data);
        this.schemaVersion = typeof input.schemaVersion === 'number'
            && Number.isInteger(input.schemaVersion)
            && input.schemaVersion > 0
            ? input.schemaVersion
            : CONFIG_SCHEMA_VERSION;
        this.branchType = readString(input, 'branchType');
        this.hotfixOriginBranch = readOptionalString(input, 'hotfixOriginBranch');
        this.hotfixBranch = readOptionalString(input, 'hotfixBranch');
        this.releaseBranch = readOptionalString(input, 'releaseBranch');
        this.parentBranch = readOptionalString(input, 'parentBranch');
        this.workingBranch = readOptionalString(input, 'workingBranch');
        if (input['branchConfiguration'] !== undefined && input['branchConfiguration'] !== null) {
            this.branchConfiguration = new BranchConfiguration(input['branchConfiguration']);
        }
        if (isRecommendationState(input['recommendationState'])) {
            this.recommendationState = input['recommendationState'];
        }
    }
}
