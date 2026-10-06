import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionRequirement,
    SetupTokenPermissionStatus,
    SetupTokenPublicReadEvidence,
} from '../../domain/setup_token_permissions';

const NO_SAFE_EVIDENCE_MESSAGE = 'No safe permission evidence was returned for this requirement.';
const WRITE_NOT_VERIFIABLE_MESSAGE = 'Write access requires a completed temporary create/read/delete check.';

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
        // Cleanup is a blocking fact even if the adapter also supplied duplicate,
        // malformed, or contradictory success evidence for this same target.
        const cleanupPending = requirement.level === 'write' && candidates.some(row =>
            matchesRequirement(requirement, row) && row.cleanupPending === true);
        const secretCollision = requirement.level === 'write' && requirement.probe === 'secrets'
            && candidates.some(row => matchesRequirement(requirement, row) && row.incident === 'secret-collision');
        if (candidates.length !== 1 || !isMatchingEvidence(requirement, candidate)) {
            return { ...unverifiable(requirement, NO_SAFE_EVIDENCE_MESSAGE),
                ...(cleanupPending || secretCollision ? { cleanupPending: true as const } : {}),
                ...(secretCollision ? { incident: 'secret-collision' as const } : {}) };
        }
        if (requirement.level === 'write' && candidate.status === 'verified'
            && candidate.writeProof !== 'transaction') {
            return unverifiable(requirement, WRITE_NOT_VERIFIABLE_MESSAGE);
        }

        return {
            ...requirement,
            status: candidate.status,
            message: candidate.message,
            ...(requirement.level === 'write' && candidate.status === 'verified'
                && candidate.writeProof === 'transaction' ? { writeProof: 'transaction' as const } : {}),
            ...(requirement.level === 'write' && candidate.status === 'unverifiable'
                && candidate.cleanupPending === true ? { cleanupPending: true as const } : {}),
            ...(candidate.incident === 'secret-collision' ? { incident: 'secret-collision' as const } : {}),
            ...(candidate.prerequisite ? { prerequisite: candidate.prerequisite } : {}),
            ...(candidate.status === 'available'
                && candidate.operationallyAvailable === true
                && isOperationallyAvailableSetupRead(requirement, candidate.publicReadEvidence)
                ? { operationallyAvailable: true as const, publicReadEvidence: candidate.publicReadEvidence }
                : {}),
            ...(candidate.status === 'available'
                && isAttestableProjectsRead(requirement, candidate.publicReadEvidence)
                ? { publicReadEvidence: candidate.publicReadEvidence }
                : {}),
        };
    });
}

/** Limits positive usability without promoting publicly readable evidence to verified PAT access. */
export function isOperationallyAvailableSetupRead(
    requirement: Pick<SetupTokenPermissionRequirement, 'scope' | 'permission' | 'level' | 'probe'>,
    evidence: SetupTokenPublicReadEvidence | undefined,
): boolean {
    return requirement.level === 'read' && (
        (requirement.scope === 'repository'
            && evidence === 'public-repository'
            && PUBLIC_REPOSITORY_READ_PROBES.has(requirement.probe)
            && requirement.permission.toLowerCase().replace(/ /gu, '-') === requirement.probe)
        || isAttestableProjectsRead(requirement, evidence)
    );
}

export function isAttestableProjectsRead(
    requirement: Pick<SetupTokenPermissionRequirement, 'scope' | 'permission' | 'level' | 'probe'>,
    evidence: SetupTokenPublicReadEvidence | undefined,
): boolean {
    return requirement.level === 'read'
        && requirement.scope === 'organization'
        && requirement.permission === 'Projects'
        && requirement.probe === 'projects'
        && evidence === 'public-organization-projects';
}

const PUBLIC_REPOSITORY_READ_PROBES = new Set<SetupTokenPermissionRequirement['probe']>([
    'metadata', 'contents', 'issues', 'actions', 'checks', 'pull-requests', 'workflows',
]);

function isMatchingEvidence(
    requirement: SetupTokenPermissionRequirement,
    value: Record<string, unknown>,
): value is Record<string, unknown> & SetupTokenPermissionCheck {
    return matchesRequirement(requirement, value)
        && isPermissionStatus(value.status)
        && typeof value.message === 'string'
        && value.message.trim().length > 0
        && (value.operationallyAvailable === undefined || value.operationallyAvailable === true)
        && (value.writeProof === undefined || (requirement.level === 'write'
            && value.status === 'verified' && value.writeProof === 'transaction'))
        && (value.cleanupPending === undefined || (requirement.level === 'write'
            && value.status === 'unverifiable' && value.cleanupPending === true))
        && (value.incident === undefined || (requirement.level === 'write' && requirement.probe === 'secrets'
            && value.status === 'unverifiable' && value.cleanupPending === true && value.incident === 'secret-collision'))
        && (value.prerequisite === undefined || (requirement.scope === 'repository'
            && requirement.level === 'write' && requirement.probe === 'actions' && value.status === 'unverifiable'
            && (value.prerequisite === 'contents-write' || value.prerequisite === 'contents-workflows-write'
                || value.prerequisite === 'dispatch-workflow')))
        && (value.publicReadEvidence === undefined
            || (value.status === 'available' && (
                isOperationallyAvailableSetupRead(requirement, value.publicReadEvidence as SetupTokenPublicReadEvidence)
                || isAttestableProjectsRead(requirement, value.publicReadEvidence as SetupTokenPublicReadEvidence)
            )));
}

function matchesRequirement(requirement: SetupTokenPermissionRequirement, value: Record<string, unknown>): boolean {
    return value.id === requirement.id
        && value.role === requirement.role
        && value.scope === requirement.scope
        && value.permission === requirement.permission
        && value.level === requirement.level
        && value.applicability === requirement.applicability
        && value.condition === requirement.condition
        && value.probe === requirement.probe;
}

function isPermissionStatus(value: unknown): value is SetupTokenPermissionStatus {
    return value === 'verified' || value === 'available' || value === 'missing' || value === 'unverifiable';
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
