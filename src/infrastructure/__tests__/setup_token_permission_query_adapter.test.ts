import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

const requirement = (
    level: 'read' | 'write' = 'read',
    probe: SetupTokenPermissionRequirement['probe'] = 'metadata',
    scope: SetupTokenPermissionRequirement['scope'] = 'repository',
): SetupTokenPermissionRequirement => ({
    id: `setup.${scope}.${probe}`, role: 'setup', scope, permission: probe,
    level, applicability: 'required', reason: 'test', probe,
});

function response(ok: boolean, status: number): Response {
    return { ok, status } as Response;
}

describe('SetupTokenPermissionQueryAdapter', () => {
    it('can be constructed with the production defaults', () => {
        expect(new SetupTokenPermissionQueryAdapter()).toBeInstanceOf(SetupTokenPermissionQueryAdapter);
    });

    it('verifies a read permission through a GET-only probe', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(true, 200));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect(
            'owner', 'repo', 'secret-token', [requirement()],
        );
        expect(check).toMatchObject({ status: 'verified' });
        expect(fetcher).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo', expect.objectContaining({ method: 'GET' }));
        expect(JSON.stringify(check)).not.toContain('secret-token');
    });

    it('keeps a write level unverifiable after a successful read probe', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(true, 200)) })
            .inspect('owner', 'repo', 'secret', [requirement('write', 'issues')]);
        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('no safe proof of write') });
    });

    it.each([401, 403])('maps HTTP %s to missing permission evidence', async status => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, status)) })
            .inspect('owner', 'repo', 'secret', [requirement()]);
        expect(check).toMatchObject({ status: 'missing' });
    });

    it('treats HTTP 404 as ambiguous instead of claiming a missing permission', async () => {
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher: jest.fn().mockResolvedValue(response(false, 404)) })
            .inspect('owner', 'repo', 'secret', [requirement()]);
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
        const fetcher = jest.fn().mockResolvedValue(response(true, 200));
        const probes: SetupTokenPermissionRequirement['probe'][] = [
            'metadata', 'contents', 'administration', 'issues', 'actions', 'checks',
            'pull-requests', 'variables', 'secrets', 'workflows',
        ];

        await new SetupTokenPermissionQueryAdapter({ fetcher, timeoutMs: 50 }).inspect(
            'owner/name',
            'repo name',
            'secret-token',
            probes.map(probe => requirement('read', probe)),
        );

        expect(fetcher).toHaveBeenCalledTimes(probes.length);
        for (const [url, options] of fetcher.mock.calls) {
            expect(url).toContain('owner%2Fname/repo%20name');
            expect(options).toEqual(expect.objectContaining({ method: 'GET' }));
        }
        expect(fetcher.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
            'https://api.github.com/repos/owner%2Fname/repo%20name/commits/HEAD/check-runs?per_page=1',
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
