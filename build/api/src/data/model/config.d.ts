import { BranchConfiguration } from "./branch_configuration";
import { RecommendationState } from "./recommendation_state";
import { Result } from "./result";
import { type DeploymentOperationSnapshot } from '../../domain/deployment_operation';
/** Version of the durable configuration contract stored in issue/PR content. */
export declare const CONFIG_SCHEMA_VERSION = 3;
/** Accepts only the currently supported durable configuration contract. */
export declare function requireCurrentConfigurationPayload(value: unknown): Record<string, unknown>;
export declare class Config {
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
    results: Result[];
    branchConfiguration: BranchConfiguration | undefined;
    recommendationState: RecommendationState | undefined;
    constructor(data: unknown);
}
