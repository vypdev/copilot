import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionRequirement,
    SetupTokenPermissionStatus,
} from '../../domain/setup_token_permissions';

const NO_SAFE_EVIDENCE_MESSAGE = 'No safe permission evidence was returned for this requirement.';
const WRITE_NOT_VERIFIABLE_MESSAGE = 'Write access cannot be verified with a safe read-only permission probe.';

/**
 * Reconciles untrusted adapter evidence against immutable permission requirements.
 * Provider output can describe evidence, but cannot redefine what setup requires.
 */
export function reconcileSetupTokenPermissionEvidence(
    requirements: readonly SetupTokenPermissionRequirement[],
    evidence: unknown,
): SetupTokenPermissionCheck[] {
    const rows: readonly unknown[] = Array.isArray(evidence) ? evidence : [];
    return requirements.map((requirement) => {
        const candidates = rows.filter((row): row is Record<string, unknown> => (
            isRecord(row) && row.id === requirement.id
        ));
        const candidate = candidates[0];
        if (candidates.length !== 1 || !isMatchingEvidence(requirement, candidate)) {
            return unverifiable(requirement, NO_SAFE_EVIDENCE_MESSAGE);
        }
        if (requirement.level === 'write' && candidate.status === 'verified') {
            return unverifiable(requirement, WRITE_NOT_VERIFIABLE_MESSAGE);
        }

        return {
            ...requirement,
            status: candidate.status,
            message: candidate.message,
            ...(candidate.status === 'unverifiable'
                && requirement.scope === 'repository'
                && requirement.level === 'read'
                && candidate.operationallyAvailable === true
                ? { operationallyAvailable: true as const }
                : {}),
        };
    });
}

function isMatchingEvidence(
    requirement: SetupTokenPermissionRequirement,
    value: Record<string, unknown>,
): value is Record<string, unknown> & SetupTokenPermissionCheck {
    return value.id === requirement.id
        && value.role === requirement.role
        && value.scope === requirement.scope
        && value.permission === requirement.permission
        && value.level === requirement.level
        && value.applicability === requirement.applicability
        && value.condition === requirement.condition
        && value.probe === requirement.probe
        && isPermissionStatus(value.status)
        && typeof value.message === 'string'
        && value.message.trim().length > 0
        && (value.operationallyAvailable === undefined || value.operationallyAvailable === true);
}

function isPermissionStatus(value: unknown): value is SetupTokenPermissionStatus {
    return value === 'verified' || value === 'missing' || value === 'unverifiable';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unverifiable(
    requirement: SetupTokenPermissionRequirement,
    message: string,
): SetupTokenPermissionCheck {
    return { ...requirement, status: 'unverifiable', message };
}
