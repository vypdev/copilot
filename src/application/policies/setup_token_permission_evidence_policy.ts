import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionRequirement,
    SetupTokenPermissionStatus,
    SetupTokenPublicReadEvidence,
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
                && candidate.operationallyAvailable === true
                && isOperationallyAvailableSetupRead(requirement, candidate.publicReadEvidence)
                ? { operationallyAvailable: true as const, publicReadEvidence: candidate.publicReadEvidence }
                : {}),
        };
    });
}

/** Limits positive usability without promoting publicly readable evidence to verified PAT access. */
export function isOperationallyAvailableSetupRead(
    requirement: Pick<SetupTokenPermissionRequirement, 'scope' | 'permission' | 'level' | 'probe'>,
    evidence: SetupTokenPublicReadEvidence | undefined,
): boolean {
    return requirement.level === 'read'
        && requirement.scope === 'repository'
        && evidence === 'public-repository'
        && PUBLIC_REPOSITORY_READ_PROBES.has(requirement.probe)
        && requirement.permission.toLowerCase().replace(/ /gu, '-') === requirement.probe;
}

const PUBLIC_REPOSITORY_READ_PROBES = new Set<SetupTokenPermissionRequirement['probe']>([
    'metadata', 'contents', 'administration', 'issues', 'actions', 'checks', 'pull-requests', 'workflows',
]);

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
        && (value.operationallyAvailable === undefined || value.operationallyAvailable === true)
        && (value.publicReadEvidence === undefined
            || value.publicReadEvidence === 'public-repository');
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
