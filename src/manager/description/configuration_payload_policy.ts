import { CONFIG_SCHEMA_VERSION, migrateConfigurationPayload } from '../../data/model/config';

export interface ConfigurationPayloadContext {
    readonly currentConfiguration: {
        readonly branchType: string;
        readonly releaseBranch?: string;
        readonly workingBranch?: string;
        readonly parentBranch?: string;
        readonly hotfixOriginBranch?: string;
        readonly hotfixBranch?: string;
        readonly branchConfiguration?: unknown;
        readonly recommendationState?: unknown;
    };
}

export function buildConfigurationPayload(execution: ConfigurationPayloadContext, storedRaw: string | undefined): string {
    const current = execution.currentConfiguration;
    const stored = parseStoredConfiguration(storedRaw);
    const payload: Record<string, unknown> = {
        schemaVersion: CONFIG_SCHEMA_VERSION,
        branchType: current.branchType,
        releaseBranch: current.releaseBranch,
        workingBranch: current.workingBranch,
        parentBranch: current.parentBranch,
        hotfixOriginBranch: current.hotfixOriginBranch,
        hotfixBranch: current.hotfixBranch,
        branchConfiguration: current.branchConfiguration,
        recommendationState: current.recommendationState,
    };
    mergeMissingValues(payload, stored);
    preserveFutureSchemaVersion(payload, stored);
    delete payload.results;
    return JSON.stringify(payload, null, 4);
}

function parseStoredConfiguration(storedRaw: string | undefined): Record<string, unknown> | undefined {
    if (!storedRaw?.trim()) return undefined;
    try {
        return migrateConfigurationPayload(JSON.parse(storedRaw)).payload;
    } catch {
        return undefined;
    }
}

function mergeMissingValues(payload: Record<string, unknown>, stored: Record<string, unknown> | undefined): void {
    if (!stored) return;
    for (const key of Object.keys(stored)) {
        if (payload[key] === undefined && stored[key] !== undefined) payload[key] = stored[key];
    }
}

function preserveFutureSchemaVersion(
    payload: Record<string, unknown>,
    stored: Record<string, unknown> | undefined,
): void {
    if (typeof stored?.schemaVersion === 'number' && stored.schemaVersion > CONFIG_SCHEMA_VERSION) {
        payload.schemaVersion = stored.schemaVersion;
    }
}
