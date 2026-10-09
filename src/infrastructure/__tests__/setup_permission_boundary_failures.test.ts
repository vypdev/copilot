import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';
import { cleanupIssue } from '../setup_permission_issue_cleanup';
import { SetupPermissionProbeHttp, writeProbeFailure } from '../setup_permission_probe_http';
import { inspectOrganizationProjectsRead, inspectSelectedOrganizationProjectsRead } from '../setup_permission_projects_read';
import { mapProbeResponse } from '../setup_permission_read_evidence';

const reply = (status: number, body: unknown = {}, headers?: Record<string, string>) => new Response(JSON.stringify(body), { status, headers });
const requirement: SetupTokenPermissionRequirement = { id: 'test', role: 'setup', scope: 'organization', permission: 'Projects',
    level: 'read', probe: 'projects', applicability: 'required', reason: 'fixture' };

describe('PAT boundary failure contracts', () => {
    it('rejects a foreign HTTP origin without sending its credential', async () => {
        const fetcher = jest.fn();
        await expect(new SetupPermissionProbeHttp(fetcher, 'fixture-token', 1000).request('https://example.com/'))
            .rejects.toThrow('Invalid GitHub probe target');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('does not expose arbitrary transport error data in write evidence', () => {
        expect(writeProbeFailure({ ...requirement, level: 'write' }, new Error('fixture-token')))
            .toMatchObject({ status: 'unverifiable', message: 'The temporary permission check could not complete.' });
    });

    it('does not promote a successful read response to a write grant', async () => {
        expect(await mapProbeResponse({ ...requirement, level: 'write' }, reply(200, []), 'permission-bound', 'owner'))
            .toMatchObject({ status: 'unverifiable' });
    });

    it('rejects malformed membership response bytes', async () => {
        expect(await mapProbeResponse({ ...requirement, permission: 'Members', probe: 'members' },
            new Response('invalid', { status: 200 }), 'organization-membership', 'owner')).toMatchObject({ status: 'unverifiable' });
    });

    it('does not convert a failed second Project page into available discovery', async () => {
        const request = jest.fn().mockResolvedValue(reply(401));
        const first = reply(200, [], { link: '<https://api.github.com/orgs/owner/projectsV2?per_page=100&page=2>; rel="next"' });
        expect(await inspectOrganizationProjectsRead(requirement, first, 'owner', request)).toMatchObject({ status: 'missing' });
        expect(request).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid selected Project list without contacting GitHub', async () => {
        const request = jest.fn();
        expect(await inspectSelectedOrganizationProjectsRead(requirement, 'owner', '1,1', request))
            .toMatchObject({ status: 'unverifiable' });
        expect(request).not.toHaveBeenCalled();
    });

    it.each([null, [], 'invalid-json'])('rejects malformed selected Project metadata %j', async payload => {
        const request = jest.fn().mockResolvedValue(payload === 'invalid-json' ? new Response('invalid', { status: 200 }) : reply(200, payload));
        expect(await inspectSelectedOrganizationProjectsRead(requirement, 'owner', '1', request))
            .toMatchObject({ status: 'unverifiable', message: expect.stringContaining('invalid selected Project') });
    });

    it('rejects an unsafe Issue recovery repository before any request', async () => {
        const fetcher = jest.fn();
        await expect(cleanupIssue(new SetupPermissionProbeHttp(fetcher, 'fixture-token', 1000), 'unsafe owner', 'repo', 'title'))
            .rejects.toThrow('unsafe repository');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('does not delete an Issue with an unsafe recovered identity', async () => {
        const fetcher = jest.fn().mockResolvedValue(reply(200, { incomplete_results: false, total_count: 1,
            items: [{ title: 'title', repository_url: 'https://api.github.com/repos/owner/repo', number: 0, node_id: 'I_fixture123' }] }));
        await expect(cleanupIssue(new SetupPermissionProbeHttp(fetcher, 'fixture-token', 1000), 'owner', 'repo', 'title'))
            .rejects.toThrow('safe Issue identity');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('retains cleanup when the exact Issue lookup is unavailable', async () => {
        const fetcher = jest.fn().mockResolvedValue(reply(503));
        await expect(cleanupIssue(new SetupPermissionProbeHttp(fetcher, 'fixture-token', 1000), 'owner', 'repo', 'title', 42, 'I_fixture123'))
            .rejects.toMatchObject({ cleanupPending: true, httpStatus: 503 });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it.each(['unconfirmed', 'foreign'] as const)('retains cleanup after %s Issue closure', async scenario => {
        const issue = { number: 42, node_id: 'I_fixture123', title: 'title', repository_url: 'https://api.github.com/repos/owner/repo' };
        let closing = false;
        const fetcher = jest.fn(async (_url: string, init?: RequestInit) => {
            if (init?.method === 'POST') return reply(403);
            if (init?.method === 'PATCH') { closing = true; return reply(200); }
            return reply(200, { ...issue, title: closing && scenario === 'foreign' ? 'foreign' : issue.title, state: 'open' });
        }) as unknown as typeof fetch;
        await expect(cleanupIssue(new SetupPermissionProbeHttp(fetcher, 'fixture-token', 1000), 'owner', 'repo', 'title', 42, 'I_fixture123'))
            .rejects.toMatchObject({ cleanupPending: true, message: expect.stringContaining('confirmed closed') });
    });
});
