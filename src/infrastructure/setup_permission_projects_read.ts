import type { SetupTokenPermissionCheck, SetupTokenPermissionRequirement } from '../domain/setup_token_permissions';
import { nextOrganizationProjectsProbePage } from './setup_projects_probe_page_policy';
import { mapProbeResponse, outcome } from './setup_permission_read_evidence';
import { selectedProjectNumbers } from './setup_permission_projects_access';

export async function inspectOrganizationProjectsRead(
    requirement: SetupTokenPermissionRequirement,
    firstResponse: Response,
    owner: string,
    request: (url: string) => Promise<Response>,
): Promise<SetupTokenPermissionCheck> {
    try {
        let response = firstResponse;
        for (let page = 0; page < 2; page += 1) {
            const payload: unknown = await response.json();
            if (!Array.isArray(payload) || payload.some(project => typeof project !== 'object' || project === null
                || Array.isArray(project) || typeof (project as Record<string, unknown>).public !== 'boolean')) {
                return outcome(requirement, 'unverifiable', 'GitHub returned an unrecognized organization Projects list.');
            }
            if (payload.some(project => (project as Record<string, unknown>).public === false)) {
                return outcome(requirement, 'verified', 'GitHub returned a non-public organization Project through a read-only Projects probe.');
            }
            const next = nextOrganizationProjectsProbePage(response.headers.get('link'), owner);
            if (next.status === 'unsafe') {
                return outcome(requirement, 'unverifiable', 'GitHub returned an unsafe organization Projects pagination link.');
            }
            if (next.status === 'none' || page === 1) break;
            response = await request(next.url);
            if (!response.ok) return mapProbeResponse(requirement, response, 'organization-projects', owner);
        }
        return {
            ...outcome(requirement, 'available', 'The organization Projects read succeeded, including an empty result; private Project access is not independently proven.'),
            operationallyAvailable: true,
            publicReadEvidence: 'public-organization-projects',
        };
    } catch {
        return outcome(requirement, 'unverifiable', 'GitHub organization Projects response could not be inspected safely.');
    }
}

export async function inspectSelectedOrganizationProjectsRead(
    requirement: SetupTokenPermissionRequirement,
    owner: string,
    selection: string,
    request: (url: string) => Promise<Response>,
): Promise<SetupTokenPermissionCheck> {
    const numbers = selectedProjectNumbers(selection);
    if (!numbers) {
        return outcome(requirement, 'unverifiable', 'The approved Project selection was not a bounded list of numbers.');
    }
    let privateProjectObserved = false;
    for (const number of numbers) {
        const response = await request(`https://api.github.com/orgs/${encodeURIComponent(owner)}/projectsV2/${number}`);
        if (response.status !== 200) return mapProbeResponse(requirement, response, 'organization-projects', owner);
        let project: Record<string, unknown>;
        try {
            const payload: unknown = await response.json();
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid');
            project = payload as Record<string, unknown>;
        } catch {
            return outcome(requirement, 'unverifiable', 'GitHub returned an invalid selected Project response.');
        }
        const projectOwner = project.owner;
        if (project.number !== Number(number) || typeof project.public !== 'boolean'
            || !projectOwner || typeof projectOwner !== 'object' || Array.isArray(projectOwner)
            || typeof (projectOwner as Record<string, unknown>).login !== 'string'
            || ((projectOwner as Record<string, unknown>).login as string).toLowerCase() !== owner.toLowerCase()) {
            return outcome(requirement, 'unverifiable', 'GitHub did not confirm the exact selected Project and organization.');
        }
        if (project.public === false) privateProjectObserved = true;
    }
    return privateProjectObserved
        ? outcome(requirement, 'verified', 'GitHub returned every selected Project, including a private organization Project.')
        : { ...outcome(requirement, 'available', 'Every selected Project read succeeded, but all are public; the PAT grant is not independently proven.'),
            operationallyAvailable: true, publicReadEvidence: 'public-organization-projects' };
}
