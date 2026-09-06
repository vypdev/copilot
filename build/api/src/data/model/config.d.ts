import { BranchConfiguration } from "./branch_configuration";
import { RecommendationState } from "./recommendation_state";
import { Result } from "./result";
/** Version of the durable configuration contract stored in issue/PR content. */
export declare const CONFIG_SCHEMA_VERSION = 2;
export interface ConfigurationMigrationResult {
    readonly payload: Record<string, unknown>;
    readonly sourceVersion: number;
    readonly migrated: boolean;
    readonly futureVersion: boolean;
}
/**
 * Normalizes persisted configuration without silently losing fields from a
 * newer installation. Unknown keys are deliberately retained so a downgrade
 * or a mixed-version workflow can round-trip data safely.
 */
export declare function migrateConfigurationPayload(value: unknown): ConfigurationMigrationResult;
export declare class Config {
    readonly schemaVersion: number;
    branchType: string;
    releaseBranch: string | undefined;
    workingBranch: string | undefined;
    parentBranch: string | undefined;
    hotfixOriginBranch: string | undefined;
    hotfixBranch: string | undefined;
    results: Result[];
    branchConfiguration: BranchConfiguration | undefined;
    recommendationState: RecommendationState | undefined;
    constructor(data: unknown);
}
