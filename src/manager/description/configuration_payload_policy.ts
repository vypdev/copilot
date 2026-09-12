import { CONFIG_SCHEMA_VERSION } from '../../data/model/config';
import type { ConfigurationPayloadContext } from '../../application/ports/configuration_store_ports';

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
        releaseOriginBranch: current.releaseOriginBranch,
        releaseOriginSha: current.releaseOriginSha,
        hotfixOriginSha: current.hotfixOriginSha,
        deploymentOrchestration: current.deploymentOrchestration,
        branchConfiguration: current.branchConfiguration,
        recommendationState: current.recommendationState,
    };
    mergeMissingValues(payload, stored);
    return JSON.stringify(payload, null, 4);
}

function parseStoredConfiguration(storedRaw: string | undefined): Record<string, unknown> | undefined {
    if (!storedRaw?.trim()) return undefined;
    try {
        const parsed = JSON.parse(storedRaw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            && (parsed as Record<string, unknown>).schemaVersion === CONFIG_SCHEMA_VERSION
            ? parsed as Record<string, unknown>
            : undefined;
    } catch {
        return undefined;
    }
}

function mergeMissingValues(payload: Record<string, unknown>, stored: Record<string, unknown> | undefined): void {
    if (!stored) return;
    for (const key of Object.keys(payload)) {
        if (payload[key] === undefined && stored[key] !== undefined) payload[key] = stored[key];
    }
}
