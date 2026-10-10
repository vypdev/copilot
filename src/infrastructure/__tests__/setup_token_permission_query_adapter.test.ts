import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';
import { SetupTokenPermissionsUseCase } from '../../application/usecases/setup/setup_token_permissions_use_case';
import { buildSetupPatPermissionRequirements } from '../../application/policies/setup_token_permission_policy';
import { SetupPermissionProbeJournal } from '../setup_permission_probe_journal';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function immediateJournal(): SetupPermissionProbeJournal {
    const journal = new SetupPermissionProbeJournal();
    jest.spyOn(journal, 'recover').mockResolvedValue();
    return journal;
}

const requirement = (
    level: 'read' | 'write' = 'read',
    probe: SetupTokenPermissionRequirement['probe'] = 'metadata',
    scope: SetupTokenPermissionRequirement['scope'] = 'repository',
): SetupTokenPermissionRequirement => ({
    id: `setup.${scope}.${probe}`,
    role: 'setup',
    scope,
    permission: probe === 'members' ? 'Members' : probe === 'issue-types' ? 'Issue Types'
        : probe === 'projects' && scope === 'organization' ? 'Projects' : probe,
    level, applicability: 'required', reason: 'test', probe,
});

function response(
    ok: boolean,
    status: number,
    options: { message?: string; headers?: Record<string, string>; payload?: unknown } = {},
): Response {
    const headers = Object.fromEntries(
        Object.entries(options.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
    );
    return {
        ok,
        status,
        headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
        json: jest.fn().mockResolvedValue(options.payload ?? (options.message ? { message: options.message } : {})),
    } as unknown as Response;
}


function validReadPayload(url: string, isPrivate = true): unknown {
    const path = new URL(url).pathname;
    if (/\/repos\/[^/]+\/[^/]+$/u.test(path)) return { private: isPrivate, default_branch: 'main' };
    if (path.endsWith('/actions/permissions')) return { enabled: true };
    if (path.endsWith('/check-runs')) return { check_runs: [] };
    if (path.endsWith('/actions/workflows')) return { workflows: [] };
    if (path.endsWith('/actions/secrets')) return { secrets: [] };
    if (path.endsWith('/actions/variables')) return { variables: [] };
    return [];
}

const ambiguousForbiddenResponses: ReadonlyArray<{
    label: string;
    options: { message?: string; headers?: Record<string, string> };
}> = [
    { label: 'bare', options: {} },
    { label: 'generic Forbidden', options: { message: 'Forbidden' } },
    { label: 'primary rate limit', options: { message: 'Forbidden', headers: { 'x-ratelimit-remaining': '0' } } },
    { label: 'secondary rate limit', options: { message: 'Forbidden', headers: { 'retry-after': '60' } } },
    { label: 'SSO constraint', options: { message: 'Forbidden', headers: { 'x-github-sso': 'required' } } },
];

describe('SetupTokenPermissionQueryAdapter', () => {
    it('accepts a successful empty organization Projects read without claiming private access', async () => {
        const requirements = buildSetupPatPermissionRequirements()
            .filter(item => item.permission === 'Metadata'
                || (item.permission === 'Contents' && item.level === 'read') || item.permission === 'Projects')
            .map(item => ({ ...item, applicability: 'required' as const }));
        const fetcher = jest.fn(async (url: string) => url.endsWith('/projectsV2?per_page=100')
            ? response(true, 200, { payload: [] })
            : response(true, 200, { payload: validReadPayload(url) }));
        const audit = new SetupTokenPermissionsUseCase({
            validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'ok' }),
        }, new SetupTokenPermissionQueryAdapter({ fetcher: fetcher as typeof fetch }));
        const report = await audit.inspect({ role: 'setup', owner: 'owner', repository: 'repo',
            token: 'secret-token', requirements });
        expect(report).toMatchObject({ ready: true, confirmationRequired: false });
        expect(report.checks.find(check => check.permission === 'Projects')).toMatchObject({
            status: 'available',
            publicReadEvidence: 'public-organization-projects',
        });
        expect(report.checks.find(check => check.permission === 'Projects')?.operationallyAvailable).toBe(true);
        expect(fetcher.mock.calls.map(call => call[0])).toContain('https://api.github.com/orgs/owner/projectsV2?per_page=100');
    });
    it('can be constructed with the production defaults', () => {
        expect(new SetupTokenPermissionQueryAdapter()).toBeInstanceOf(SetupTokenPermissionQueryAdapter);
    });

    it('limits probes to four concurrent requests while preserving requirement order', async () => {
        let active = 0;
        let maximumActive = 0;
        const releases: Array<() => void> = [];
        const fetcher = jest.fn(async () => {
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            await new Promise<void>(resolve => releases.push(resolve));
            active -= 1;
            return response(true, 200);
        });
        const requirements = Array.from({ length: 6 }, (_, index) => ({
            ...requirement(),
            id: `requirement-${index}`,
        }));

        const inspection = new SetupTokenPermissionQueryAdapter({ fetcher, journal: immediateJournal() }).inspect(
            'owner', 'repo', 'secret-token', requirements,
        );

        await new Promise<void>(resolve => setImmediate(resolve));
        expect(fetcher).toHaveBeenCalledTimes(4);
        releases.splice(0).forEach(release => release());
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(fetcher).toHaveBeenCalledTimes(6);
        expect(maximumActive).toBe(4);
        releases.splice(0).forEach(release => release());

        const checks = await inspection;
        expect(checks.map(check => check.id)).toEqual(requirements.map(item => item.id));
    });

    it('verifies a read permission through a GET-only probe', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, { payload: { private: true } }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement()],
        );
        expect(check).toMatchObject({ status: 'verified' });
        expect(fetcher).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo', expect.objectContaining({ method: 'GET' }));
        expect(JSON.stringify(check)).not.toContain('secret-token');
    });

    it.each([
        'metadata', 'contents', 'issues', 'actions', 'checks',
        'pull-requests', 'workflows',
    ] as const)('reports a successful public repository %s read as available', async probe => {
        const fetcher = jest.fn(async (url: Parameters<typeof fetch>[0], _options?: RequestInit) => response(true, 200, { payload: validReadPayload(String(url), false) }));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', probe)],
        );

        expect(fetcher).toHaveBeenCalledTimes(probe === 'metadata' ? 1 : 2);
        expect(check).toMatchObject({
            status: 'available',
            message: expect.stringContaining('public repository'),
            operationallyAvailable: true,
            publicReadEvidence: 'public-repository',
        });
    });

    it('fails closed when successful metadata does not establish repository visibility', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, { payload: { default_branch: 'main' } }));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'actions')],
        );

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(check).toMatchObject({
            status: 'unverifiable',
            message: expect.stringContaining('did not establish'),
        });
    });

    it.each([
        ['repository', 'secrets'],
        ['repository', 'variables'],
        ['organization', 'secrets'],
        ['organization', 'variables'],
    ] as const)('verifies a successful permission-bound %s %s inventory probe directly', async (scope, probe) => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, { payload: { [probe]: [] } }));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', probe, scope)],
        );

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(check).toMatchObject({ status: 'verified' });
    });

    it('verifies Members read only with active self-membership for the selected organization', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, {
            payload: { state: 'active', organization: { login: 'owner' } },
        }));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'members', 'organization')],
        );

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith('https://api.github.com/user/memberships/orgs/owner', expect.any(Object));
        expect(check).toMatchObject({ status: 'verified' });
        expect(check.operationallyAvailable).toBeUndefined();
    });

    it.each([
        ['public-list-shaped', []],
        ['pending', { state: 'pending', organization: { login: 'owner' } }],
        ['wrong-organization', { state: 'active', organization: { login: 'other' } }],
    ] as const)('does not accept %s Members evidence as full-read proof', async (_label, payload) => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, { payload }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'members', 'organization')],
        );

        expect(check).toMatchObject({ status: 'unverifiable' });
        expect(check.operationallyAvailable).toBeUndefined();
    });

    it('keeps a successful public organization Issue Types probe unusable as permission evidence', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'issue-types', 'organization')],
        );

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(check).toMatchObject({ status: 'unverifiable' });
        expect(check.operationallyAvailable).toBeUndefined();
    });

    it('does not infer Issues Write from label access when exact Issue creation is denied', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'copilot-issue-grant-'));
        try {
            const calls: string[] = [];
            const fetcher = jest.fn(async (url: string, options?: RequestInit) => {
                calls.push(`${options?.method} ${new URL(url).pathname}`);
                return response(false, 403);
            }) as unknown as typeof fetch;
            const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher,
                journal: new SetupPermissionProbeJournal(folder) })
                .inspect('owner', 'repo', 'secret', [requirement('write', 'issues')]);
            expect(check).toMatchObject({ status: 'unverifiable', message: 'GitHub POST returned HTTP 403.' });
            expect(check.writeProof).toBeUndefined();
            expect(calls).toEqual(['POST /repos/owner/repo/issues']);
            expect(await readdir(folder)).toEqual([]);
        } finally { await rm(folder, { recursive: true, force: true }); }
    });

    it('publishes the closed Issue number when deletion is denied after Issues Write succeeds', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'copilot-issue-residue-'));
        try {
            const root = 'https://api.github.com/repos/owner/repo';
            let title = '';
            let state = 'open';
            const fetcher = jest.fn(async (url: string, options?: RequestInit) => {
                const path = new URL(url).pathname;
                const method = options?.method ?? 'GET';
                const issue = { number: 42, node_id: 'I_fixtureNode123', title, repository_url: root, state };
                if (path === '/repos/owner/repo/issues' && method === 'POST') {
                    title = (JSON.parse(String(options?.body)) as { title: string }).title;
                    return response(true, 201, { payload: { ...issue, title } });
                }
                if (path === '/repos/owner/repo/issues/42' && method === 'GET') return response(true, 200, { payload: issue });
                if (path === '/graphql' && method === 'POST') return response(false, 403);
                if (path === '/repos/owner/repo/issues/42' && method === 'PATCH') {
                    state = 'closed'; return response(true, 200, { payload: { ...issue, state } });
                }
                throw new Error(`Unexpected fixture request ${method} ${path}`);
            }) as unknown as typeof fetch;
            const progress: Array<{ phase: string; detail?: string }> = [];
            const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher,
                journal: new SetupPermissionProbeJournal(folder) })
                .inspect('owner', 'repo', 'secret', [requirement('write', 'issues')], update => progress.push(update));
            expect(check).toMatchObject({ status: 'unverifiable', cleanupPending: true,
                message: expect.stringContaining('Issue #42 remains closed') });
            expect(progress.at(-1)).toMatchObject({ phase: 'failed', detail: 'issue-closed-42' });
            expect(await readdir(folder)).toHaveLength(1);
        } finally { await rm(folder, { recursive: true, force: true }); }
    });

    it('verifies Contents read when the commit-list probe identifies an empty repository', async () => {
        const fetcher = jest.fn()
            .mockResolvedValueOnce(response(true, 200, { payload: { private: true } }))
            .mockResolvedValueOnce(response(false, 409));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'contents')]);

        expect(fetcher).toHaveBeenCalledWith(
            'https://api.github.com/repos/owner/repo/commits?per_page=1',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(check).toMatchObject({ status: 'verified', message: expect.stringContaining('repository is empty') });
    });

    it('reports an empty public repository read as available', async () => {
        const fetcher = jest.fn()
            .mockResolvedValueOnce(response(true, 200, { payload: { private: false } }))
            .mockResolvedValueOnce(response(false, 409));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'contents')]);

        expect(check).toMatchObject({
            status: 'available',
            operationallyAvailable: true,
            publicReadEvidence: 'public-repository',
            message: expect.stringContaining('does not prove'),
        });
    });

    it('keeps Contents write unverifiable for an empty repository', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, 409)) })
            .inspect('owner', 'repo', 'secret', [requirement('write', 'contents')]);

        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('HTTP 409') });
    });

    it('keeps a non-Contents 409 unverifiable', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, 409)) })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'metadata')]);

        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('HTTP 409') });
    });

    it('resolves and encodes the repository default branch before probing Checks', async () => {
        const fetcher = jest.fn()
            .mockResolvedValueOnce(response(true, 200, { payload: { default_branch: 'release/v1', private: true } }))
            .mockResolvedValueOnce(response(true, 200, { payload: { check_runs: [] } }));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'checks')]);

        expect(fetcher.mock.calls.map(call => call[0])).toEqual([
            'https://api.github.com/repos/owner/repo',
            'https://api.github.com/repos/owner/repo/commits/release%2Fv1/check-runs?per_page=1',
        ]);
        expect(fetcher.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
        expect(check).toMatchObject({ status: 'verified' });
    });

    it.each([
        ['missing', {}],
        ['non-object', 'main'],
        ['array', ['main']],
        ['empty', { default_branch: '' }],
        ['control-character', { default_branch: 'main\nunsafe' }],
        ['oversized', { default_branch: 'x'.repeat(256) }],
    ])('keeps Checks unverifiable when default-branch metadata is %s', async (_label, payload) => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, { payload }));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'checks')]);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith(
            'https://api.github.com/repos/owner/repo',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(check).toMatchObject({
            status: 'unverifiable',
            message: expect.stringContaining('safe default branch'),
        });
    });

    it('keeps Checks unverifiable when default-branch metadata cannot be resolved', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(false, 401));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'checks')]);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(check).toMatchObject({
            status: 'unverifiable',
            message: expect.stringContaining('could not resolve a safe default branch'),
        });
    });

    it('keeps Checks unverifiable when default-branch metadata cannot be parsed', async () => {
        const metadataResponse = {
            ...response(true, 200),
            json: jest.fn().mockRejectedValue(new Error('private provider body')),
        } as unknown as Response;
        const fetcher = jest.fn().mockResolvedValue(metadataResponse);

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'checks')]);

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(check).toMatchObject({ status: 'unverifiable' });
        expect(check.message).not.toContain('private provider body');
    });

    it('maps HTTP 401 to missing permission evidence', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, 401)) })
            .inspect('owner', 'repo', 'secret', [requirement()]);
        expect(check).toMatchObject({ status: 'missing' });
    });

    it('maps an explicit bounded HTTP 403 permission denial to missing', async () => {
        const providerMessage = 'Resource not accessible by personal access token';
        const [check] = await new SetupTokenPermissionQueryAdapter({
            fetcher: jest.fn().mockResolvedValue(response(false, 403, { message: providerMessage })),
        }).inspect('owner', 'repo', 'secret', [requirement()]);

        expect(check).toMatchObject({ status: 'missing' });
        expect(check.message).not.toContain(providerMessage);
    });

    it.each(ambiguousForbiddenResponses)('keeps a $label HTTP 403 unverifiable', async ({ options }) => {
        const [check] = await new SetupTokenPermissionQueryAdapter({
            fetcher: jest.fn().mockResolvedValue(response(false, 403, options)),
        }).inspect('owner', 'repo', 'secret', [requirement()]);

        expect(check).toMatchObject({ status: 'unverifiable' });
    });

    it.each([
        {
            label: 'unparseable provider JSON',
            json: jest.fn().mockRejectedValue(new Error('provider body unavailable')),
            getHeader: jest.fn().mockReturnValue(null),
        },
        {
            label: 'non-object provider JSON',
            json: jest.fn().mockResolvedValue('Forbidden'),
            getHeader: jest.fn().mockReturnValue(null),
        },
        {
            label: 'unavailable provider headers',
            json: jest.fn().mockResolvedValue({ message: 'Resource not accessible by personal access token' }),
            getHeader: jest.fn(() => { throw new Error('provider headers unavailable'); }),
        },
    ])('keeps a 403 with $label unverifiable', async ({ json, getHeader }) => {
        const providerResponse = {
            ok: false,
            status: 403,
            headers: { get: getHeader },
            json,
        } as unknown as Response;
        const [check] = await new SetupTokenPermissionQueryAdapter({
            fetcher: jest.fn().mockResolvedValue(providerResponse),
        }).inspect('owner', 'repo', 'secret', [requirement()]);

        expect(check).toMatchObject({ status: 'unverifiable' });
        expect(check.message).not.toContain('provider');
    });

    it('treats HTTP 404 as ambiguous instead of claiming a missing permission', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, 404)) })
            .inspect('owner', 'repo', 'secret', [requirement()]);
        expect(check).toMatchObject({ status: 'unverifiable' });
    });

    it('keeps a Contents 404 ambiguous instead of treating it as an empty repository', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, 404)) })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'contents')]);
        expect(check).toMatchObject({ status: 'unverifiable' });
    });

    it('maps unexpected provider responses to unverifiable evidence', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, 500)) })
            .inspect('owner', 'repo', 'secret', [requirement()]);
        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('HTTP 500') });
    });

    it('maps network failures to a safe unverifiable result', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockRejectedValue(new Error('secret provider body')) })
            .inspect('owner', 'repo', 'secret-token', [requirement()]);
        expect(check).toEqual(expect.objectContaining({ status: 'unverifiable', message: 'The permission probe was unavailable or timed out.' }));
        expect(check.message).not.toContain('secret provider body');
    });

    it('bounds a stalled permission probe with the configured timeout', async () => {
        jest.useFakeTimers();
        try {
            const fetcher = jest.fn((
                _url: Parameters<typeof fetch>[0],
                options?: Parameters<typeof fetch>[1],
            ) => new Promise<Response>((_resolve, reject) => {
                options?.signal?.addEventListener('abort', () => reject(new Error('aborted provider request')), { once: true });
            }));
            const inspection = new SetupTokenPermissionQueryAdapter({ fetcher, timeoutMs: 5, journal: immediateJournal() })
                .inspect('owner', 'repo', 'secret-token', [requirement()]);

            await jest.advanceTimersByTimeAsync(5);

            await expect(inspection).resolves.toEqual([
                expect.objectContaining({ status: 'unverifiable', message: 'The permission probe was unavailable or timed out.' }),
            ]);
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not make a request when a write probe has no isolated transaction', async () => {
        const fetcher = jest.fn();
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret', [requirement('write', 'workflows', 'organization')],
        );
        expect(fetcher).not.toHaveBeenCalled();
        expect(check).toMatchObject({ status: 'unverifiable' });
    });

    it('targets organization Actions resources without leaking credentials into the URL', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200));
        await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'my org', 'repo', 'secret-token', [requirement('write', 'variables', 'organization')],
        );
        expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/repos/my%20org/repo');
        expect(fetcher.mock.calls[0][0]).not.toContain('secret-token');
    });

    it('maps every supported repository probe to a read-only endpoint', async () => {
        const fetcher = jest.fn(async (url: Parameters<typeof fetch>[0], _options?: RequestInit) => response(true, 200, { payload: validReadPayload(String(url)) }));
        const probes: SetupTokenPermissionRequirement['probe'][] = [
            'metadata', 'contents', 'administration', 'issues', 'actions', 'checks',
            'pull-requests', 'variables', 'secrets', 'workflows',
        ];

        const checks = await new SetupTokenPermissionQueryAdapter({ fetcher, timeoutMs: 50 }).inspect(
            'owner/name',
            'repo name',
            'secret-token',
            probes.map(probe => requirement('read', probe)),
        );

        expect(fetcher).toHaveBeenCalledTimes(16);
        expect(checks).toHaveLength(probes.length);
        expect(checks.every(check => check.status === 'verified')).toBe(true);
        for (const [url, options] of fetcher.mock.calls) {
            expect(url).toContain('owner%2Fname/repo%20name');
            expect(options).toEqual(expect.objectContaining({ method: 'GET' }));
        }
        expect(fetcher.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
            'https://api.github.com/repos/owner%2Fname/repo%20name/commits?per_page=1',
            'https://api.github.com/repos/owner%2Fname/repo%20name/commits/main/check-runs?per_page=1',
            'https://api.github.com/repos/owner%2Fname/repo%20name/contents/.github/workflows',
        ]));
    });

    it('maps every supported organization probe including read-only Projects discovery', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200));
        const probes: SetupTokenPermissionRequirement['probe'][] = ['secrets', 'variables', 'members', 'issue-types', 'projects'];

        const checks = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner',
            'repo',
            'secret-token',
            probes.map(probe => requirement('read', probe, 'organization')),
        );

        expect(fetcher).toHaveBeenCalledTimes(5);
        expect(fetcher.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
            'https://api.github.com/orgs/owner/actions/secrets?per_page=1',
            'https://api.github.com/orgs/owner/actions/variables?per_page=1',
            'https://api.github.com/user/memberships/orgs/owner',
            'https://api.github.com/orgs/owner/issue-types?per_page=1',
            'https://api.github.com/orgs/owner/projectsV2?per_page=100',
        ]));
        expect(checks.at(-1)).toMatchObject({ probe: 'projects', status: 'unverifiable' });
    });

    it('verifies organization Projects read only from a non-public result', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, { payload: [{ number: 3, public: false }] }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'projects', 'organization')],
        );
        expect(check).toMatchObject({ status: 'verified' });
        expect(fetcher).toHaveBeenCalledWith('https://api.github.com/orgs/owner/projectsV2?per_page=100',
            expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'X-GitHub-Api-Version': '2026-03-10' }) }));
        expect(JSON.stringify(check)).not.toContain('secret-token');
    });

    it('reads each selected Project by exact number and verifies a private result', async () => {
        const fetcher = jest.fn(async (url: string) => response(true, 200, {
            payload: { number: Number(url.split('/').at(-1)), public: url.endsWith('/7'), owner: { login: 'owner' } },
        }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: fetcher as typeof fetch,
            journal: immediateJournal() }).inspect('owner', 'repo', 'secret-token',
            [requirement('read', 'projects', 'organization')], undefined, '7,9');
        expect(check).toMatchObject({ status: 'verified' });
        expect(fetcher.mock.calls.map(call => call[0])).toEqual([
            'https://api.github.com/orgs/owner/projectsV2/7',
            'https://api.github.com/orgs/owner/projectsV2/9',
        ]);
        expect(JSON.stringify(check)).not.toContain('secret-token');
    });

    it('accepts exact public Project reads without claiming a PAT grant', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, {
            payload: { number: 7, public: true, owner: { login: 'owner' } },
        }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher,
            journal: immediateJournal() }).inspect('owner', 'repo', 'secret-token',
            [requirement('read', 'projects', 'organization')], undefined, '7');
        expect(check).toMatchObject({ status: 'available', publicReadEvidence: 'public-organization-projects' });
    });

    it.each([404, 403])('blocks when an exact selected Project read returns HTTP %s', async status => {
        const fetcher = jest.fn().mockResolvedValue(response(false, status));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher,
            journal: immediateJournal() }).inspect('owner', 'repo', 'secret-token',
            [requirement('read', 'projects', 'organization')], undefined, '7');
        expect(check.status).toBe('unverifiable');
        expect(check.operationallyAvailable).toBeUndefined();
    });

    it('rejects a successful selected Project read for a different owner', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, {
            payload: { number: 7, public: false, owner: { login: 'other' } },
        }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher,
            journal: immediateJournal() }).inspect('owner', 'repo', 'secret-token',
            [requirement('read', 'projects', 'organization')], undefined, '7');
        expect(check.status).toBe('unverifiable');
    });

    it('finds a non-public Project on the second bounded organization page', async () => {
        const root = 'https://api.github.com/orgs/owner/projectsV2?per_page=100';
        const next = 'https://api.github.com/orgs/owner/projectsV2?per_page=100&page=2';
        const fetcher = jest.fn(async (url: string) => url === root
            ? response(true, 200, { payload: [{ number: 1, public: true }],
                headers: { link: '<' + next + '>; rel="next"' } })
            : response(true, 200, { payload: [{ number: 2, public: false }] }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: fetcher as typeof fetch }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'projects', 'organization')],
        );
        expect(check.status).toBe('verified');
        expect(fetcher.mock.calls.map(call => call[0])).toEqual([root, next]);
    });

    it('keeps the permission deadline active while a second Projects page stalls', async () => {
        jest.useFakeTimers();
        try {
            const root = 'https://api.github.com/orgs/owner/projectsV2?per_page=100';
            const next = 'https://api.github.com/orgs/owner/projectsV2?per_page=100&page=2';
            let secondSignal: AbortSignal | undefined;
            const fetcher = jest.fn((url: string, options?: RequestInit) => url === root
                ? Promise.resolve(response(true, 200, {
                    payload: [{ number: 1, public: true }],
                    headers: { link: '<' + next + '>; rel="next"' },
                }))
                : new Promise<Response>((_resolve, reject) => {
                    secondSignal = options?.signal ?? undefined;
                    secondSignal?.addEventListener('abort', () => reject(new Error('stalled second page')), { once: true });
                }));
            const inspection = new SetupTokenPermissionQueryAdapter({ fetcher: fetcher as typeof fetch, timeoutMs: 5, journal: immediateJournal() })
                .inspect('owner', 'repo', 'secret-token', [requirement('read', 'projects', 'organization')]);
            await jest.advanceTimersByTimeAsync(0);
            expect(fetcher.mock.calls.map(call => call[0])).toEqual([root, next]);
            await jest.advanceTimersByTimeAsync(5);
            const [check] = await inspection;
            expect(check.status).toBe('unverifiable');
            expect(check.publicReadEvidence).toBeUndefined();
            expect(secondSignal?.aborted).toBe(true);
        } finally {
            jest.useRealTimers();
        }
    });

    it('reports a bounded public Projects list read as available after two pages', async () => {
        const root = 'https://api.github.com/orgs/owner/projectsV2?per_page=100';
        const second = 'https://api.github.com/orgs/owner/projectsV2?per_page=100&page=2';
        const third = 'https://api.github.com/orgs/owner/projectsV2?per_page=100&page=3';
        const fetcher = jest.fn(async (url: string) => response(true, 200, {
            payload: [{ number: url === root ? 1 : 2, public: true }],
            headers: { link: '<' + (url === root ? second : third) + '>; rel="next"' },
        }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: fetcher as typeof fetch }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'projects', 'organization')],
        );
        expect(check).toMatchObject({ status: 'available', publicReadEvidence: 'public-organization-projects' });
        expect(fetcher.mock.calls.map(call => call[0])).toEqual([root, second]);
    });

    it('does not follow a cross-origin Projects pagination link with the PAT', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, {
            payload: [{ number: 1, public: true }],
            headers: { link: '<https://example.invalid/orgs/owner/projectsV2?per_page=100&page=2>; rel="next"' },
        }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'projects', 'organization')],
        );
        expect(check.status).toBe('unverifiable');
        expect(check.publicReadEvidence).toBeUndefined();
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it.each([
        { label: 'empty', payload: [] },
        { label: 'public-only', payload: [{ number: 2, public: true }] },
    ])('reports $label Projects access as a successful read', async ({ payload }) => {
        const [check] = await new SetupTokenPermissionQueryAdapter({
            fetcher: jest.fn().mockResolvedValue(response(true, 200, { payload })),
        }).inspect('owner', 'repo', 'secret-token', [requirement('read', 'projects', 'organization')]);
        expect(check).toMatchObject({ status: 'available',
            publicReadEvidence: 'public-organization-projects' });
        expect(check.operationallyAvailable).toBe(true);
    });

    it.each([
        ['malformed', response(true, 200, { payload: [{ number: 1 }] })],
        ['non-list', response(true, 200, { payload: { public: false } })],
        ['denied', response(false, 403, { message: 'Resource not accessible by personal access token' })],
        ['missing', response(false, 404)],
    ])('does not accept %s organization Projects evidence', async (_case, providerResponse) => {
        const [check] = await new SetupTokenPermissionQueryAdapter({
            fetcher: jest.fn().mockResolvedValue(providerResponse),
        }).inspect('owner', 'repo', 'secret-token', [requirement('read', 'projects', 'organization')]);
        expect(check.operationallyAvailable).toBeUndefined();
        expect(check.status).not.toBe('verified');
    });

    it('leaves an unsupported repository probe unverifiable without a request', async () => {
        const fetcher = jest.fn();
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'projects')],
        );
        expect(fetcher).not.toHaveBeenCalled();
        expect(check).toMatchObject({ status: 'unverifiable' });
    });
});
