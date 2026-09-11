import {BranchConfiguration} from "./branch_configuration";
import {isRecommendationState, RecommendationState} from "./recommendation_state";
import {Result} from "./result";
import { asModelInput, readOptionalString, readString } from './model_input';
import { isDeploymentOperationSnapshot, type DeploymentOperationSnapshot } from '../../domain/deployment_operation';

/** Version of the durable configuration contract stored in issue/PR content. */
export const CONFIG_SCHEMA_VERSION = 3;

/** Accepts only the currently supported durable configuration contract. */
export function requireCurrentConfigurationPayload(value: unknown): Record<string, unknown> {
    const input = asModelInput(value);
    if (input.schemaVersion !== CONFIG_SCHEMA_VERSION) {
        throw new Error(`Unsupported configuration schema. Expected ${CONFIG_SCHEMA_VERSION}.`);
    }
    return input;
}

export class Config {
    readonly schemaVersion: number;
    branchType: string;
    releaseBranch: string | undefined;
    workingBranch: string | undefined;
    parentBranch: string | undefined;
    hotfixOriginBranch: string | undefined;
    hotfixBranch: string | undefined;
    releaseOriginBranch: string | undefined;
    releaseOriginSha: string | undefined;
    hotfixOriginSha: string | undefined;
    deploymentOrchestration: DeploymentOperationSnapshot | undefined;
    results: Result[] = [];
    branchConfiguration: BranchConfiguration | undefined;
    recommendationState: RecommendationState | undefined;

    constructor(data: unknown) {
        const input = asModelInput(data);
        this.schemaVersion = CONFIG_SCHEMA_VERSION;
        this.branchType = readString(input, 'branchType');
        this.hotfixOriginBranch = readOptionalString(input, 'hotfixOriginBranch');
        this.hotfixBranch = readOptionalString(input, 'hotfixBranch');
        this.releaseBranch = readOptionalString(input, 'releaseBranch');
        this.releaseOriginBranch = readOptionalString(input, 'releaseOriginBranch');
        this.releaseOriginSha = readOptionalString(input, 'releaseOriginSha');
        this.hotfixOriginSha = readOptionalString(input, 'hotfixOriginSha');
        this.parentBranch = readOptionalString(input, 'parentBranch');
        this.workingBranch = readOptionalString(input, 'workingBranch');
        if (input['branchConfiguration'] !== undefined && input['branchConfiguration'] !== null) {
            this.branchConfiguration = new BranchConfiguration(input['branchConfiguration']);
        }
        if (isRecommendationState(input['recommendationState'])) {
            this.recommendationState = input['recommendationState'];
        }
        if (isDeploymentOperationSnapshot(input['deploymentOrchestration'])) {
            this.deploymentOrchestration = input['deploymentOrchestration'];
        }
    }
}
