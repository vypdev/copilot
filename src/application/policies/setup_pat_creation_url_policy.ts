import type { SetupTokenPermissionRequirement, SetupTokenPermissionScope } from '../../domain/setup_token_permissions';

const PAT_FORM = 'https://github.com/settings/personal-access-tokens/new';

const QUERY_PERMISSIONS: Readonly<Record<SetupTokenPermissionScope, Readonly<Record<string, string>>>> = {
    repository: {
        Metadata: 'metadata',
        Contents: 'contents',
        Secrets: 'secrets',
        Variables: 'actions_variables',
        Issues: 'issues',
        Actions: 'actions',
        Administration: 'administration',
        Workflows: 'workflows',
        'Pull requests': 'pull_requests',
    },
    organization: {
        Secrets: 'organization_secrets',
        Variables: 'organization_actions_variables',
        'Issue Types': 'issue_types',
        Projects: 'organization_projects',
        Members: 'members',
    },
};

export class UnsupportedSetupPatLinkError extends Error {
    constructor(readonly permissions: readonly string[]) {
        super(`GitHub's fine-grained PAT form cannot prefill: ${permissions.join(', ')}.`);
        this.name = 'UnsupportedSetupPatLinkError';
    }
}

/** Builds only documented GitHub form fields; never accepts credential material. */
export function buildSetupPatCreationUrl(input: Readonly<{
    role: 'setup' | 'workflow';
    owner: string;
    repository: string;
    expiresIn: number;
    requirements: readonly SetupTokenPermissionRequirement[];
}>): string {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(input.owner)
        || !/^[A-Za-z0-9._-]{1,100}$/.test(input.repository)
        || !Number.isInteger(input.expiresIn)
        || input.expiresIn < 1
        || input.expiresIn > 366) {
        throw new Error('Invalid PAT form owner, repository, or expiration.');
    }

    const grants = new Map<string, 'read' | 'write'>();
    const unsupported: string[] = [];
    for (const item of input.requirements) {
        if (item.role !== input.role) throw new Error('PAT permission role does not match the requested form.');
        if (item.applicability !== 'required') continue;
        const key = QUERY_PERMISSIONS[item.scope][item.permission];
        if (!key || (key === 'metadata' && item.level !== 'read')
            || (key === 'workflows' && item.level !== 'write')) {
            unsupported.push(`${item.scope} ${item.permission} ${item.level}`);
            continue;
        }
        if (grants.get(key) !== 'write') grants.set(key, item.level);
    }
    if (unsupported.length > 0) throw new UnsupportedSetupPatLinkError(unsupported);

    const url = new URL(PAT_FORM);
    url.searchParams.set('name', `Copilot ${input.role === 'setup' ? 'setup' : 'bot'} ${input.repository}`.slice(0, 40));
    url.searchParams.set('description', `Copilot ${input.role === 'setup' ? 'repository setup' : 'GitHub Action'} for ${input.owner}/${input.repository}`);
    url.searchParams.set('target_name', input.owner);
    url.searchParams.set('expires_in', String(input.expiresIn));
    for (const [key, level] of [...grants].sort(([left], [right]) => left.localeCompare(right))) {
        url.searchParams.set(key, level);
    }
    const result = url.toString();
    if (result.length > 2_048) throw new Error('PAT form URL exceeds the supported terminal length; create the PAT manually.');
    return result;
}
