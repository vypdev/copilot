import type { SetupTokenPermissionQueryPort } from '../application/ports/setup_token_permission_ports';
import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionRequirement,
} from '../domain/setup_token_permissions';
import { isGithubPermissionDenied } from '../data/repository/github/github_error_policy';
import { runWithConcurrencyLimit } from '../application/policies/bounded_concurrency_policy';

const SETUP_PERMISSION_PROBE_CONCURRENCY = 4;
const MAX_GITHUB_DEFAULT_BRANCH_LENGTH = 255;

type ProbeTarget =
    | Readonly<{ status: 'ready'; url: string }>
    | Readonly<{ status: 'complete'; check: SetupTokenPermissionCheck }>;

export interface SetupTokenPermissionQueryOptions {
    fetcher?: typeof fetch;
    timeoutMs?: number;
}

/** Maps safe GitHub reads to semantic permission evidence without test mutations. */
export class SetupTokenPermissionQueryAdapter implements SetupTokenPermissionQueryPort {
    private readonly fetcher: typeof fetch;
    private readonly timeoutMs: number;

    constructor(options: SetupTokenPermissionQueryOptions = {}) {
        this.fetcher = options.fetcher ?? fetch;
        this.timeoutMs = options.timeoutMs ?? 10_000;
    }

    inspect(
        owner: string,
        repository: string,
        token: string,
        requirements: readonly SetupTokenPermissionRequirement[],
    ): Promise<readonly SetupTokenPermissionCheck[]> {
        return runWithConcurrencyLimit(
            requirements.map(requirement => () => this.inspectOne(owner, repository, token, requirement)),
            SETUP_PERMISSION_PROBE_CONCURRENCY,
        );
    }

    private async inspectOne(
        owner: string,
        repository: string,
        token: string,
        requirement: SetupTokenPermissionRequirement,
    ): Promise<SetupTokenPermissionCheck> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const request = (url: string) => this.fetcher(url, {
                method: 'GET',
                headers: permissionProbeHeaders(token),
                signal: controller.signal,
            });
            const target = await resolveProbeTarget(owner, repository, requirement, request);
            if (target.status === 'complete') return target.check;
            return mapProbeResponse(requirement, await request(target.url));
        } catch {
            return outcome(requirement, 'unverifiable', 'The permission probe was unavailable or timed out.');
        } finally {
            clearTimeout(timeout);
        }
    }
}

function permissionProbeHeaders(token: string): Record<string, string> {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
}

async function resolveProbeTarget(
    owner: string,
    repository: string,
    requirement: SetupTokenPermissionRequirement,
    request: (url: string) => Promise<Response>,
): Promise<ProbeTarget> {
    if (requirement.scope === 'repository' && requirement.probe === 'checks') {
        const metadataResponse = await request(repositoryRoot(owner, repository));
        if (!metadataResponse.ok) {
            return {
                status: 'complete',
                check: outcome(
                    requirement,
                    'unverifiable',
                    'GitHub could not resolve a safe default branch for the Checks probe.',
                ),
            };
        }
        const defaultBranch = await readDefaultBranch(metadataResponse);
        if (!defaultBranch) {
            return {
                status: 'complete',
                check: outcome(
                    requirement,
                    'unverifiable',
                    'GitHub repository metadata did not provide a safe default branch for the Checks probe.',
                ),
            };
        }
        return {
            status: 'ready',
            url: `${repositoryRoot(owner, repository)}/commits/${encodeURIComponent(defaultBranch)}/check-runs?per_page=1`,
        };
    }
    const url = probeUrl(owner, repository, requirement);
    return url
        ? { status: 'ready', url }
        : {
            status: 'complete',
            check: outcome(requirement, 'unverifiable', 'GitHub does not expose a safe read-only proof for this permission.'),
        };
}

async function readDefaultBranch(response: Response): Promise<string | undefined> {
    try {
        const payload: unknown = await response.json();
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
        const branch = (payload as Record<string, unknown>).default_branch;
        if (typeof branch !== 'string'
            || branch.length === 0
            || branch.length > MAX_GITHUB_DEFAULT_BRANCH_LENGTH
            || containsAsciiControl(branch)) return undefined;
        return branch;
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
): Promise<SetupTokenPermissionCheck> {
    if (response.ok) {
        return requirement.level === 'read'
            ? outcome(requirement, 'verified', 'GitHub accepted the read-only capability probe.')
            : outcome(requirement, 'unverifiable', 'Read access is available, but GitHub exposes no safe proof of write access.');
    }
    if (response.status === 409
        && requirement.scope === 'repository'
        && requirement.probe === 'contents') {
        return requirement.level === 'read'
            ? outcome(requirement, 'verified', 'GitHub confirmed that the accessible Git repository is empty.')
            : outcome(requirement, 'unverifiable', 'GitHub confirmed that the repository is empty, but this read-only probe cannot prove write access.');
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
        if (requirement.probe === 'members') return `${organizationRoot}/members?per_page=1`;
        if (requirement.probe === 'issue-types') return `${organizationRoot}/issue-types?per_page=1`;
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
