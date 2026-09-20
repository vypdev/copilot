import type { SetupTokenPermissionQueryPort } from '../application/ports/setup_token_permission_ports';
import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionRequirement,
} from '../domain/setup_token_permissions';
import { isGithubPermissionDenied } from '../data/repository/github/github_error_policy';

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
        return Promise.all(requirements.map(requirement => this.inspectOne(owner, repository, token, requirement)));
    }

    private async inspectOne(
        owner: string,
        repository: string,
        token: string,
        requirement: SetupTokenPermissionRequirement,
    ): Promise<SetupTokenPermissionCheck> {
        const url = probeUrl(owner, repository, requirement);
        if (!url) return outcome(requirement, 'unverifiable', 'GitHub does not expose a safe read-only proof for this permission.');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetcher(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
                signal: controller.signal,
            });
            if (response.ok) {
                return requirement.level === 'read'
                    ? outcome(requirement, 'verified', 'GitHub accepted the read-only capability probe.')
                    : outcome(requirement, 'unverifiable', 'Read access is available, but GitHub exposes no safe proof of write access.');
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
        } catch {
            return outcome(requirement, 'unverifiable', 'The permission probe was unavailable or timed out.');
        } finally {
            clearTimeout(timeout);
        }
    }
}

async function isDeterministicPermissionDenial(response: Response): Promise<boolean> {
    const message = await readProviderMessage(response);
    const headers = Object.fromEntries(
        ['retry-after', 'x-ratelimit-remaining', 'x-github-sso']
            .map(name => [name, readResponseHeader(response, name)] as const)
            .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
    );
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

function readResponseHeader(response: Response, name: string): string | undefined {
    try {
        return response.headers?.get(name) ?? undefined;
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
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepository = encodeURIComponent(repository);
    const repositoryRoot = `https://api.github.com/repos/${encodedOwner}/${encodedRepository}`;
    if (requirement.scope === 'organization') {
        const organizationRoot = `https://api.github.com/orgs/${encodedOwner}`;
        if (requirement.probe === 'secrets') return `${organizationRoot}/actions/secrets?per_page=1`;
        if (requirement.probe === 'variables') return `${organizationRoot}/actions/variables?per_page=1`;
        if (requirement.probe === 'members') return `${organizationRoot}/members?per_page=1`;
        if (requirement.probe === 'issue-types') return `${organizationRoot}/issue-types?per_page=1`;
        return undefined;
    }
    if (requirement.probe === 'metadata') return repositoryRoot;
    if (requirement.probe === 'contents') return `${repositoryRoot}/contents`;
    if (requirement.probe === 'administration') return `${repositoryRoot}/rulesets?per_page=1`;
    if (requirement.probe === 'issues') return `${repositoryRoot}/labels?per_page=1`;
    if (requirement.probe === 'actions') return `${repositoryRoot}/actions/workflows?per_page=1`;
    if (requirement.probe === 'checks') return `${repositoryRoot}/commits/HEAD/check-runs?per_page=1`;
    if (requirement.probe === 'pull-requests') return `${repositoryRoot}/pulls?state=open&per_page=1`;
    if (requirement.probe === 'variables') return `${repositoryRoot}/actions/variables?per_page=1`;
    if (requirement.probe === 'secrets') return `${repositoryRoot}/actions/secrets?per_page=1`;
    if (requirement.probe === 'workflows') return `${repositoryRoot}/contents/.github/workflows`;
    return undefined;
}
