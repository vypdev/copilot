import {BranchConfiguration} from "./branch_configuration";
import {isRecommendationState, RecommendationState} from "./recommendation_state";
import {Result} from "./result";
import { asModelInput, readOptionalString, readString } from './model_input';

/** Version of the durable configuration contract stored in issue/PR content. */
export const CONFIG_SCHEMA_VERSION = 2;

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
export function migrateConfigurationPayload(value: unknown): ConfigurationMigrationResult {
    const original = { ...asModelInput(value) };
    const sourceVersion = readSchemaVersion(original['schemaVersion']);

    if (sourceVersion > CONFIG_SCHEMA_VERSION) {
        return {
            payload: original,
            sourceVersion,
            migrated: false,
            futureVersion: true,
        };
    }

    const payload = { ...original };
    const hadTransientResults = Object.prototype.hasOwnProperty.call(payload, 'results');
    delete payload.results;

    if (payload.branchConfiguration === null) delete payload.branchConfiguration;
    if (!isRecommendationState(payload.recommendationState)) delete payload.recommendationState;
    payload.schemaVersion = CONFIG_SCHEMA_VERSION;

    return {
        payload,
        sourceVersion,
        migrated: sourceVersion !== CONFIG_SCHEMA_VERSION || hadTransientResults,
        futureVersion: false,
    };
}

function readSchemaVersion(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

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
        const input = asModelInput(migrateConfigurationPayload(data).payload);
        this.schemaVersion = readSchemaVersion(input.schemaVersion) || CONFIG_SCHEMA_VERSION;
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
