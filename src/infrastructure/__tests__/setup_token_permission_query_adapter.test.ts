import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

const requirement = (
    level: 'read' | 'write' = 'read',
    probe: SetupTokenPermissionRequirement['probe'] = 'metadata',
    scope: SetupTokenPermissionRequirement['scope'] = 'repository',
): SetupTokenPermissionRequirement => ({
    id: `setup.${scope}.${probe}`,
    role: 'setup',
    scope,
    permission: probe === 'members' ? 'Members' : probe === 'issue-types' ? 'Issue Types' : probe,
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

        const inspection = new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
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
        'metadata', 'contents', 'administration', 'issues', 'actions', 'checks',
        'pull-requests', 'workflows',
    ] as const)('keeps a successful public repository %s probe unverifiable', async probe => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, {
            payload: { private: false, default_branch: 'main' },
        }));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', probe)],
        );

        expect(fetcher).toHaveBeenCalledTimes(probe === 'metadata' ? 1 : 2);
        expect(check).toMatchObject({
            status: 'unverifiable',
            message: expect.stringContaining('publicly readable'),
            operationallyAvailable: true,
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
        const fetcher = jest.fn().mockResolvedValue(response(true, 200));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', probe, scope)],
        );

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(check).toMatchObject({ status: 'verified' });
    });

    it('reports a successful public organization Members read as operational without verifying the PAT grant', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement('read', 'members', 'organization')],
        );

        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(check).toMatchObject({ status: 'unverifiable', operationallyAvailable: true });
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

    it('keeps a write level unverifiable after a successful read probe', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(true, 200)) })
            .inspect('owner', 'repo', 'secret', [requirement('write', 'issues')]);
        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('no safe proof of write') });
        expect(check.operationallyAvailable).toBeUndefined();
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

    it('keeps an empty public repository response unverifiable', async () => {
        const fetcher = jest.fn()
            .mockResolvedValueOnce(response(true, 200, { payload: { private: false } }))
            .mockResolvedValueOnce(response(false, 409));

        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'contents')]);

        expect(check).toMatchObject({
            status: 'unverifiable',
            operationallyAvailable: true,
            message: expect.stringContaining('does not prove'),
        });
    });

    it('keeps Contents write unverifiable for an empty repository', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, 409)) })
            .inspect('owner', 'repo', 'secret', [requirement('write', 'contents')]);

        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('does not prove') });
    });

    it('keeps a non-Contents 409 unverifiable', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, 409)) })
            .inspect('owner', 'repo', 'secret', [requirement('read', 'metadata')]);

        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('HTTP 409') });
    });

    it('resolves and encodes the repository default branch before probing Checks', async () => {
        const fetcher = jest.fn()
            .mockResolvedValueOnce(response(true, 200, { payload: { default_branch: 'release/v1', private: true } }))
            .mockResolvedValueOnce(response(true, 200));

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
            const inspection = new SetupTokenPermissionQueryAdapter({ fetcher, timeoutMs: 5 })
                .inspect('owner', 'repo', 'secret-token', [requirement()]);

            await jest.advanceTimersByTimeAsync(5);

            await expect(inspection).resolves.toEqual([
                expect.objectContaining({ status: 'unverifiable', message: 'The permission probe was unavailable or timed out.' }),
            ]);
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not make a request when GitHub has no safe read-only probe', async () => {
        const fetcher = jest.fn();
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret', [requirement('write', 'projects', 'organization')],
        );
        expect(fetcher).not.toHaveBeenCalled();
        expect(check).toMatchObject({ status: 'unverifiable' });
    });

    it('targets organization Actions resources without leaking credentials into the URL', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200));
        await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'my org', 'repo', 'secret-token', [requirement('write', 'variables', 'organization')],
        );
        expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/orgs/my%20org/actions/variables?per_page=1');
        expect(fetcher.mock.calls[0][0]).not.toContain('secret-token');
    });

    it('maps every supported repository probe to a read-only endpoint', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200, { payload: { default_branch: 'main', private: true } }));
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

        expect(fetcher).toHaveBeenCalledTimes(17);
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

    it('maps every supported organization probe and leaves Projects unsupported', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200));
        const probes: SetupTokenPermissionRequirement['probe'][] = ['secrets', 'variables', 'members', 'issue-types', 'projects'];

        const checks = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner',
            'repo',
            'secret-token',
            probes.map(probe => requirement('read', probe, 'organization')),
        );

        expect(fetcher).toHaveBeenCalledTimes(4);
        expect(fetcher.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
            'https://api.github.com/orgs/owner/actions/secrets?per_page=1',
            'https://api.github.com/orgs/owner/actions/variables?per_page=1',
            'https://api.github.com/orgs/owner/members?per_page=1',
            'https://api.github.com/orgs/owner/issue-types?per_page=1',
        ]));
        expect(checks.at(-1)).toMatchObject({ probe: 'projects', status: 'unverifiable' });
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
