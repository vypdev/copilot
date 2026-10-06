import type { SetupTokenPermissionCheck, SetupTokenPermissionRequirement } from '../domain/setup_token_permissions';
import { outcome, type ProbeReadEvidence } from './setup_permission_read_evidence';

const MAX_GITHUB_DEFAULT_BRANCH_LENGTH = 255;

type ProbeTarget =
    | Readonly<{
        status: 'ready';
        url: string;
        readEvidence: ProbeReadEvidence;
        response?: Response;
    }>
    | Readonly<{ status: 'complete'; check: SetupTokenPermissionCheck }>;

interface RepositoryProbeMetadata {
    readonly visibility?: 'private' | 'public';
    readonly defaultBranch?: string;
}

export function permissionProbeHeaders(token: string, requirement: SetupTokenPermissionRequirement): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': requirement.scope === 'organization' && requirement.probe === 'projects'
            ? '2026-03-10' : '2022-11-28',
    };
}

export async function resolveProbeTarget(
    owner: string,
    repository: string,
    requirement: SetupTokenPermissionRequirement,
    request: (url: string) => Promise<Response>,
): Promise<ProbeTarget> {
    const url = requirement.scope === 'repository' && requirement.probe === 'checks'
        ? repositoryRoot(owner, repository)
        : probeUrl(owner, repository, requirement);
    if (!url) {
        return {
            status: 'complete',
            check: outcome(requirement, 'unverifiable', 'GitHub does not expose a safe read-only proof for this permission.'),
        };
    }
    if (requirement.level === 'write') {
        return { status: 'ready', url, readEvidence: 'permission-bound' };
    }
    if (requirement.scope === 'organization' && requirement.probe === 'members') {
        return { status: 'ready', url, readEvidence: 'organization-membership' };
    }
    if (requirement.scope === 'organization' && requirement.probe === 'projects') {
        return { status: 'ready', url, readEvidence: 'organization-projects' };
    }
    if (requiresRepositoryVisibilityProof(requirement)) {
        const metadataResponse = await request(repositoryRoot(owner, repository));
        if (!metadataResponse.ok) {
            if (requirement.probe === 'metadata') {
                return {
                    status: 'ready',
                    url,
                    response: metadataResponse,
                    readEvidence: 'publicly-readable',
                };
            }
            return {
                status: 'complete',
                check: outcome(
                    requirement,
                    'unverifiable',
                    requirement.probe === 'checks'
                        ? 'GitHub could not resolve a safe default branch for the Checks probe.'
                        : 'GitHub could not establish repository visibility before the read-only capability probe.',
                ),
            };
        }
        const metadata = await readRepositoryProbeMetadata(metadataResponse);
        if (!metadata) {
            return {
                status: 'complete',
                check: outcome(
                    requirement,
                    'unverifiable',
                    requirement.probe === 'checks'
                        ? 'GitHub repository metadata did not provide a safe default branch for the Checks probe.'
                        : 'GitHub repository metadata could not establish safe permission evidence.',
                ),
            };
        }
        if (requirement.probe === 'checks' && !metadata.defaultBranch) {
            return {
                status: 'complete',
                check: outcome(
                    requirement,
                    'unverifiable',
                    'GitHub repository metadata did not provide a safe default branch for the Checks probe.',
                ),
            };
        }
        if (!metadata.visibility) {
            return {
                status: 'complete',
                check: outcome(
                    requirement,
                    'unverifiable',
                    'GitHub repository metadata did not establish whether this read was authentication-bound.',
                ),
            };
        }
        const readEvidence = metadata.visibility === 'private'
            ? 'permission-bound'
            : 'publicly-readable';
        if (requirement.probe === 'metadata') {
            return { status: 'ready', url, response: metadataResponse, readEvidence };
        }
        const targetUrl = requirement.probe === 'checks'
            ? `${repositoryRoot(owner, repository)}/commits/${encodeURIComponent(metadata.defaultBranch!)}/check-runs?per_page=1`
            : url;
        return {
            status: 'ready',
            url: targetUrl,
            readEvidence,
        };
    }
    return {
        status: 'ready',
        url,
        readEvidence: isPubliclyReadableOrganizationProbe(requirement)
            ? 'publicly-readable'
            : 'permission-bound',
    };
}

function requiresRepositoryVisibilityProof(requirement: SetupTokenPermissionRequirement): boolean {
    return requirement.scope === 'repository'
        && !['secrets', 'variables', 'administration'].includes(requirement.probe);
}

function isPubliclyReadableOrganizationProbe(requirement: SetupTokenPermissionRequirement): boolean {
    return requirement.scope === 'organization'
        && requirement.probe === 'issue-types';
}

async function readRepositoryProbeMetadata(response: Response): Promise<RepositoryProbeMetadata | undefined> {
    try {
        const payload: unknown = await response.json();
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
        const record = payload as Record<string, unknown>;
        const branch = record.default_branch;
        const defaultBranch = typeof branch === 'string'
            && branch.length > 0
            && branch.length <= MAX_GITHUB_DEFAULT_BRANCH_LENGTH
            && !containsAsciiControl(branch)
            ? branch
            : undefined;
        const visibility = typeof record.private === 'boolean'
            ? record.private ? 'private' : 'public'
            : undefined;
        return { visibility, defaultBranch };
    } catch {
        return undefined;
    }
}

function containsAsciiControl(value: string): boolean {
    return Array.from(value).some(character => {
        const codePoint = character.codePointAt(0);
        return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    });
}

function probeUrl(
    owner: string,
    repository: string,
    requirement: SetupTokenPermissionRequirement,
): string | undefined {
    const root = repositoryRoot(owner, repository);
    const encodedOwner = encodeURIComponent(owner);
    if (requirement.scope === 'organization') {
        const organizationRoot = `https://api.github.com/orgs/${encodedOwner}`;
        if (requirement.probe === 'secrets') return `${organizationRoot}/actions/secrets?per_page=1`;
        if (requirement.probe === 'variables') return `${organizationRoot}/actions/variables?per_page=1`;
        if (requirement.probe === 'members') return `https://api.github.com/user/memberships/orgs/${encodedOwner}`;
        if (requirement.probe === 'issue-types') return `${organizationRoot}/issue-types?per_page=1`;
        if (requirement.probe === 'projects') return `${organizationRoot}/projectsV2?per_page=100`;
        return undefined;
    }
    if (requirement.probe === 'metadata') return root;
    if (requirement.probe === 'contents') return `${root}/commits?per_page=1`;
    // Ruleset listing requires only Metadata. This endpoint actually requires Administration read.
    if (requirement.probe === 'administration') return `${root}/actions/permissions`;
    if (requirement.probe === 'issues') return `${root}/labels?per_page=1`;
    if (requirement.probe === 'actions') return `${root}/actions/workflows?per_page=1`;
    if (requirement.probe === 'pull-requests') return `${root}/pulls?state=open&per_page=1`;
    if (requirement.probe === 'variables') return `${root}/actions/variables?per_page=1`;
    if (requirement.probe === 'secrets') return `${root}/actions/secrets?per_page=1`;
    if (requirement.probe === 'workflows') return `${root}/contents/.github/workflows`;
    return undefined;
}

function repositoryRoot(owner: string, repository: string): string {
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
}
