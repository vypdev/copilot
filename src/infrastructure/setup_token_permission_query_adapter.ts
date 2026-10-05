import type { SetupTokenPermissionQueryPort } from '../application/ports/setup_token_permission_ports';
import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionRequirement,
    SetupTokenPermissionProgress,
} from '../domain/setup_token_permissions';
import { isGithubPermissionDenied } from '../data/repository/github/github_error_policy';
import { runWithConcurrencyLimit } from '../application/policies/bounded_concurrency_policy';
import { isOperationallyAvailableSetupRead } from '../application/policies/setup_token_permission_evidence_policy';
import { nextOrganizationProjectsProbePage } from './setup_projects_probe_page_policy';
import { probeDisposableResource } from './setup_permission_resource_probes';
import { ProbeFailure, SetupPermissionProbeHttp, writeProbeFailure } from './setup_permission_probe_http';
import { SetupPermissionProbeJournal } from './setup_permission_probe_journal';

const SETUP_PERMISSION_PROBE_CONCURRENCY = 4;
const MAX_GITHUB_DEFAULT_BRANCH_LENGTH = 255;

type ProbeReadEvidence = 'permission-bound' | 'publicly-readable' | 'organization-membership' | 'organization-projects';

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

export interface SetupTokenPermissionQueryOptions {
    fetcher?: typeof fetch;
    timeoutMs?: number;
    journal?: SetupPermissionProbeJournal;
}

/** Maps safe GitHub reads to semantic permission evidence without test mutations. */
export class SetupTokenPermissionQueryAdapter implements SetupTokenPermissionQueryPort {
    private readonly fetcher: typeof fetch;
    private readonly timeoutMs: number;
    private readonly journal: SetupPermissionProbeJournal;

    constructor(options: SetupTokenPermissionQueryOptions = {}) {
        this.fetcher = options.fetcher ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.journal = options.journal ?? new SetupPermissionProbeJournal();
    }

    async inspect(
        owner: string,
        repository: string,
        token: string,
        requirements: readonly SetupTokenPermissionRequirement[],
        onProgress?: (progress: SetupTokenPermissionProgress) => void,
        selectedProjectNumbers?: string,
    ): Promise<readonly SetupTokenPermissionCheck[]> {
        try {
            await this.journal.recover(owner, repository,
                new SetupPermissionProbeHttp(this.fetcher, token, this.timeoutMs));
        } catch {
            return requirements.map(requirement => {
                onProgress?.({ role: requirement.role, requirementId: requirement.id, phase: 'failed',
                    detail: 'cleanup-pending' });
                const check = outcome(requirement, 'unverifiable',
                    'An earlier temporary permission resource could not be cleaned up. Inspect the local recovery journal before retrying.');
                return requirement.level === 'write' ? { ...check, cleanupPending: true } : check;
            });
        }
        return runWithConcurrencyLimit(
            requirements.map(requirement => () => this.inspectOne(owner, repository, token, requirement, onProgress,
                selectedProjectNumbers)),
            SETUP_PERMISSION_PROBE_CONCURRENCY,
        );
    }

    private async inspectOne(
        owner: string,
        repository: string,
        token: string,
        requirement: SetupTokenPermissionRequirement,
        onProgress?: (progress: SetupTokenPermissionProgress) => void,
        selectedProjectNumbers?: string,
    ): Promise<SetupTokenPermissionCheck> {
        const emit = (phase: SetupTokenPermissionProgress['phase'], detail?: SetupTokenPermissionProgress['detail']) =>
            onProgress?.({ role: requirement.role, requirementId: requirement.id, phase, ...(detail ? { detail } : {}) });
        if (requirement.level === 'write' && requirement.applicability === 'conditional') {
            const check = outcome(requirement, 'unverifiable', 'Conditional write access will be tested if the selected plan requires it.');
            emit('skipped');
            return check;
        }
        emit('checking');
        if (requirement.level === 'write') {
            try {
                await probeDisposableResource({ owner, repository, scope: requirement.scope, probe: requirement.probe,
                    http: new SetupPermissionProbeHttp(this.fetcher, token, this.timeoutMs),
                    journal: this.journal, phase: emit });
                const check: SetupTokenPermissionCheck = { ...requirement, status: 'verified', writeProof: 'transaction',
                    message: 'GitHub accepted temporary create, exact readback, and confirmed cleanup.' };
                emit('verified');
                return check;
            } catch (error) {
                const check = writeProbeFailure(requirement, error);
                emit('failed', probeDiagnostic(error));
                return check;
            }
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const request = (url: string) => this.fetcher(url, {
                method: 'GET',
                headers: permissionProbeHeaders(token, requirement),
                signal: controller.signal,
                redirect: 'error',
            });
            if (requirement.scope === 'organization' && requirement.probe === 'projects'
                && requirement.level === 'read' && requirement.applicability === 'required'
                && selectedProjectNumbers) {
                const check = await inspectSelectedOrganizationProjectsRead(
                    requirement, owner, selectedProjectNumbers, request);
                emit(check.status === 'verified' || check.status === 'available' ? 'verified' : 'failed',
                    check.status === 'verified' || check.status === 'available' ? undefined : probeDiagnostic(check.message));
                return check;
            }
            const target = await resolveProbeTarget(owner, repository, requirement, request);
            if (target.status === 'complete') {
                emit(target.check.status === 'verified' || target.check.status === 'available' ? 'verified' : 'failed',
                    target.check.status === 'verified' || target.check.status === 'available' ? undefined : probeDiagnostic(target.check.message));
                return target.check;
            }
            const response = target.response ?? await request(target.url);
            if (target.readEvidence === 'organization-projects' && requirement.level === 'read' && response.ok) {
                const check = await inspectOrganizationProjectsRead(requirement, response, owner, request);
                emit(check.status === 'verified' || check.status === 'available' ? 'verified' : 'failed',
                    check.status === 'verified' || check.status === 'available' ? undefined : probeDiagnostic(check.message));
                return check;
            }
            const check = await mapProbeResponse(
                requirement,
                response,
                target.readEvidence,
                owner,
            );
            emit(check.status === 'verified' || check.status === 'available' ? 'verified' : 'failed',
                check.status === 'verified' || check.status === 'available' ? undefined : probeDiagnostic(check.message));
            return check;
        } catch {
            emit('failed', 'unavailable');
            return outcome(requirement, 'unverifiable', 'The permission probe was unavailable or timed out.');
        } finally {
            clearTimeout(timeout);
        }
    }
}

function permissionProbeHeaders(token: string, requirement: SetupTokenPermissionRequirement): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': requirement.scope === 'organization' && requirement.probe === 'projects'
            ? '2026-03-10' : '2022-11-28',
    };
}

async function resolveProbeTarget(
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
        && !['secrets', 'variables'].includes(requirement.probe);
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

async function mapProbeResponse(
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
        const status = await isDeterministicPermissionDenial(response)
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

async function inspectOrganizationProjectsRead(
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

async function inspectSelectedOrganizationProjectsRead(
    requirement: SetupTokenPermissionRequirement,
    owner: string,
    selection: string,
    request: (url: string) => Promise<Response>,
): Promise<SetupTokenPermissionCheck> {
    const numbers = selection.split(',');
    if (numbers.length < 1 || numbers.length > 10 || numbers.some(value => !/^[1-9][0-9]*$/u.test(value)
        || !Number.isSafeInteger(Number(value)) || Number(value) > 2_147_483_647)
        || new Set(numbers).size !== numbers.length) {
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

async function isDeterministicPermissionDenial(response: Response): Promise<boolean> {
    const message = await readProviderMessage(response);
    if (message?.toLowerCase() === 'forbidden') return false;
    let headers: Record<string, string>;
    try {
        headers = Object.fromEntries(
            ['retry-after', 'x-ratelimit-remaining', 'x-github-sso']
                .map(name => [name, response.headers.get(name) ?? undefined] as const)
                .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
        );
    } catch {
        return false;
    }
    return isGithubPermissionDenied({
        status: response.status,
        ...(message ? { message } : {}),
        response: { headers },
    });
}

async function readProviderMessage(response: Response): Promise<string | undefined> {
    try {
        const payload: unknown = await response.json();
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
        const message = (payload as Record<string, unknown>).message;
        return typeof message === 'string' ? message.trim().slice(0, 256) : undefined;
    } catch {
        return undefined;
    }
}

function outcome(
    requirement: SetupTokenPermissionRequirement,
    status: SetupTokenPermissionCheck['status'],
    message: string,
): SetupTokenPermissionCheck {
    return { ...requirement, status, message };
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
    if (requirement.probe === 'administration') return `${root}/rulesets?per_page=1`;
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

function probeDiagnostic(value: unknown): SetupTokenPermissionProgress['detail'] {
    if (value instanceof ProbeFailure) {
        if (value.cleanupPending) return 'cleanup-pending';
        if (value.httpStatus !== undefined) return `http-${value.httpStatus}` as const;
        if (value.message.startsWith('No isolated')) return 'unsupported';
        return 'unavailable';
    }
    if (typeof value === 'string') {
        const match = /HTTP ([1-5][0-9]{2})/u.exec(value);
        return match ? `http-${Number(match[1])}` : 'unavailable';
    }
    return 'unavailable';
}
