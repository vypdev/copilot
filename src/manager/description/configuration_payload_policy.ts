import type { Execution } from '../../data/model/execution';
import { CONFIG_SCHEMA_VERSION } from '../../data/model/config';

export function buildConfigurationPayload(execution: Execution, storedRaw: string | undefined): string {
    const current = execution.currentConfiguration;
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
    mergeMissingValues(payload, parseStoredConfiguration(storedRaw));
    delete payload.results;
    return JSON.stringify(payload, null, 4);
}

function parseStoredConfiguration(storedRaw: string | undefined): Record<string, unknown> | undefined {
    if (!storedRaw?.trim()) return undefined;
    try {
        return JSON.parse(storedRaw) as Record<string, unknown>;
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
