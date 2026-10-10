import type { SetupTokenPermissionCheck, SetupTokenPermissionRequirement } from '../domain/setup_token_permissions';
import { isSetupPermissionDenied } from './setup_permission_denial';
import { isOperationallyAvailableSetupRead } from '../application/policies/setup_token_permission_evidence_policy';
import { hasSetupPermissionReadShape } from './setup_permission_read_shape';

export type ProbeReadEvidence = 'permission-bound' | 'publicly-readable' | 'organization-membership' | 'organization-projects';

export async function mapProbeResponse(
    requirement: SetupTokenPermissionRequirement,
    response: Response,
    readEvidence: ProbeReadEvidence,
    owner: string,
): Promise<SetupTokenPermissionCheck> {
    if (response.ok) {
        if (readEvidence === 'organization-membership') {
            return response.status === 200 && await isActiveOrganizationMembership(response, owner)
                ? outcome(requirement, 'verified', 'GitHub confirmed active organization membership through a permission-bound Members-read probe.')
                : outcome(requirement, 'unverifiable', 'GitHub did not confirm active organization membership for the selected organization.');
        }
        if (requirement.level === 'write') {
            return outcome(requirement, 'unverifiable', 'Read access is available, but GitHub exposes no safe proof of write access.');
        }
        if (response.status !== 200 || !hasSetupPermissionReadShape(requirement.probe, await response.json())) {
            return outcome(requirement, 'unverifiable', 'GitHub returned an unrecognized read-only capability response.');
        }
        if (readEvidence === 'permission-bound') {
            return outcome(requirement, 'verified', 'GitHub accepted an authentication-bound read-only capability probe.');
        }
        const publiclyReadable = outcome(
            requirement,
            'available',
            requirement.scope === 'repository'
                ? 'Read succeeded for this public repository; the PAT grant itself is not independently proven.'
                : 'Read succeeded for this public organization resource; the PAT grant itself is not independently proven.',
        );
        const publicReadEvidence = 'public-repository' as const;
        return isOperationallyAvailableSetupRead(requirement, publicReadEvidence)
            ? { ...publiclyReadable, operationallyAvailable: true, publicReadEvidence }
            : outcome(requirement, 'unverifiable', 'A public read succeeded, but the named PAT grant could not be proven.');
    }
    if (response.status === 409
        && requirement.scope === 'repository'
        && requirement.probe === 'contents') {
        if (requirement.level === 'read' && readEvidence === 'permission-bound') {
            return outcome(requirement, 'verified', 'GitHub confirmed that the accessible Git repository is empty.');
        }
        return requirement.level === 'read' && readEvidence === 'publicly-readable'
            ? { ...outcome(requirement, 'available', 'This public repository is empty; its read is available, but does not prove the PAT permission.'), operationallyAvailable: true, publicReadEvidence: 'public-repository' }
            : outcome(requirement, 'unverifiable', 'GitHub confirmed that the repository is empty, but this read-only response does not prove the requested token permission.');
    }
    if (response.status === 401) {
        return outcome(requirement, 'missing', `GitHub rejected the read-only capability probe (HTTP ${response.status}).`);
    }
    if (response.status === 403) {
        const status = await isSetupPermissionDenied(response)
            ? 'missing'
            : 'unverifiable';
        const message = status === 'missing'
            ? 'GitHub explicitly rejected the read-only capability probe because the token lacks permission.'
            : 'GitHub returned an ambiguous forbidden response; rate limits, SSO, or permission state could not be distinguished safely.';
        return outcome(requirement, status, message);
    }
    if (response.status === 404) {
        return outcome(requirement, 'unverifiable', 'GitHub returned not found, which can mean absent data or hidden permission state.');
    }
    return outcome(requirement, 'unverifiable', `GitHub could not verify this permission safely (HTTP ${response.status}).`);
}

async function isActiveOrganizationMembership(response: Response, owner: string): Promise<boolean> {
    try {
        const payload: unknown = await response.json();
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
        const membership = payload as Record<string, unknown>;
        const organization = membership.organization;
        return membership.state === 'active'
            && typeof organization === 'object'
            && organization !== null
            && !Array.isArray(organization)
            && typeof (organization as Record<string, unknown>).login === 'string'
            && ((organization as Record<string, unknown>).login as string).toLowerCase() === owner.toLowerCase();
    } catch {
        return false;
    }
}

export function outcome(
    requirement: SetupTokenPermissionRequirement,
    status: SetupTokenPermissionCheck['status'],
    message: string,
): SetupTokenPermissionCheck {
    return { ...requirement, status, message };
}
