import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import { LegacyActionsRecoveryRequired, SetupPermissionProbeJournal } from '../setup_permission_probe_journal';
import { mapProbeResponse } from '../setup_permission_read_evidence';
import { resolveProbeTarget } from '../setup_permission_read_probe';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

const requirement: SetupTokenPermissionRequirement = {
    id: 'setup.repository.issues', role: 'setup', scope: 'repository', permission: 'Issues',
    level: 'read', applicability: 'required', reason: 'Issue labels.', probe: 'issues',
};

describe('read-only PAT probe boundaries', () => {
    it.each([
        { isPrivate: true, status: 'verified' },
        { isPrivate: false, status: 'available' },
    ])('reads native Metadata response bodies once for private=$isPrivate', async ({ isPrivate, status }) => {
        const response = new Response(JSON.stringify({ private: isPrivate, default_branch: 'main' }));
        const fetcher = jest.fn().mockResolvedValue(response);
        const metadata = { ...requirement, permission: 'Metadata', probe: 'metadata' as const };
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect('owner', 'repo', 'fixture', [metadata]);
        expect(check).toMatchObject({ status });
        expect(check.operationallyAvailable).toBe(isPrivate ? undefined : true);
        expect(response.bodyUsed).toBe(true);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo', expect.objectContaining({ method: 'GET' }));
    });
    it('surfaces actionable legacy Actions recovery to the CLI without making new requests', async () => {
        const journal = new SetupPermissionProbeJournal();
        jest.spyOn(journal, 'recover').mockRejectedValue(new LegacyActionsRecoveryRequired('internal record details'));
        const fetcher = jest.fn();
        const checks = await new SetupTokenPermissionQueryAdapter({ journal, fetcher }).inspect('owner', 'repo', 'fixture',
            [requirement, { ...requirement, level: 'write' }]);
        expect(checks).toEqual([
            expect.objectContaining({ message: expect.stringContaining('manually cancel and delete only its verified') }),
            expect.objectContaining({ cleanupPending: true, message: expect.stringContaining('Remove only that journal file') }),
        ]);
        expect(JSON.stringify(checks)).not.toContain('internal record details');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('skips a conditional write without recovery or provider requests', async () => {
        const fetcher = jest.fn();
        const progress = jest.fn();
        const journal = new SetupPermissionProbeJournal();
        const recover = jest.spyOn(journal, 'recover');
        await expect(new SetupTokenPermissionQueryAdapter({ fetcher, journal }).inspect('owner', 'repo', 'fixture',
            [{ ...requirement, level: 'write', applicability: 'conditional' }], progress))
            .resolves.toEqual([expect.objectContaining({ status: 'unverifiable' })]);
        expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'skipped' }));
        expect(fetcher).not.toHaveBeenCalled();
        expect(recover).not.toHaveBeenCalled();
    });
    it('does not publish late Project-read progress after its deadline', async () => {
        jest.useFakeTimers();
        try {
            let finish: (response: Response) => void = () => { throw new Error('late request never started'); };
            const fetcher = jest.fn().mockResolvedValueOnce(new Response('[{"public":true}]', { headers: {
                link: '<https://api.github.com/orgs/owner/projectsV2?per_page=100&page=2>; rel="next"',
            } })).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
            const progress = jest.fn();
            const pending = new SetupTokenPermissionQueryAdapter({ fetcher, timeoutMs: 50 }).inspect('owner', 'repo', 'fixture',
                [{ ...requirement, scope: 'organization', probe: 'projects', permission: 'Projects' }], progress);
            await jest.advanceTimersByTimeAsync(50);
            await expect(pending).resolves.toEqual([expect.objectContaining({ status: 'unverifiable' })]);
            const published = progress.mock.calls.length;
            finish(new Response('[{"public":false}]'));
            await jest.advanceTimersByTimeAsync(0);
            expect(progress).toHaveBeenCalledTimes(published);
            expect(fetcher).toHaveBeenCalledTimes(2);
        } finally { jest.useRealTimers(); }
    });
    it('resolves the URL for a write without claiming read evidence or contacting GitHub', async () => {
        const request = jest.fn();
        await expect(resolveProbeTarget('owner', 'repo', { ...requirement, level: 'write', probe: 'variables' }, request))
            .resolves.toMatchObject({ status: 'ready', readEvidence: 'permission-bound' });
        expect(request).not.toHaveBeenCalled();
    });
    it('rejects an unsupported organization read without a provider request', async () => {
        const request = jest.fn();
        await expect(resolveProbeTarget('owner', 'repo', { ...requirement, scope: 'organization', probe: 'contents' }, request))
            .resolves.toMatchObject({ status: 'complete', check: { status: 'unverifiable' } });
        expect(request).not.toHaveBeenCalled();
    });
    it('does not claim a proof for an unsupported repository read', async () => {
        const request = jest.fn();
        const result = await resolveProbeTarget('owner', 'repo', { ...requirement, probe: 'members' }, request);
        expect(result).toMatchObject({ status: 'complete', check: { status: 'unverifiable' } });
        expect(request).not.toHaveBeenCalled();
    });
    it.each(['unavailable', 'malformed'] as const)('blocks ordinary read probes when visibility metadata is %s', async state => {
        const request = jest.fn().mockResolvedValue(state === 'unavailable'
            ? new Response(null, { status: 503 }) : new Response('invalid-json'));
        const result = await resolveProbeTarget('owner', 'repo', requirement, request);
        expect(result).toMatchObject({ status: 'complete', check: { status: 'unverifiable',
            message: expect.stringContaining(state === 'unavailable' ? 'repository visibility' : 'safe permission evidence') } });
        expect(request).toHaveBeenCalledTimes(1);
    });
    it('keeps public organization reads from claiming repository operational evidence', async () => {
        const check = await mapProbeResponse({ ...requirement, scope: 'organization', probe: 'issue-types', permission: 'Issue Types' },
            new Response('[]'), 'publicly-readable', 'owner');
        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('named PAT grant') });
        expect(check.operationallyAvailable).toBeUndefined();
    });
    it('rejects a forged named permission on otherwise usable public repository data', async () => {
        const check = await mapProbeResponse({ ...requirement, permission: 'Administration' },
            new Response('[]'), 'publicly-readable', 'owner');
        expect(check.status).toBe('unverifiable');
        expect(check.operationallyAvailable).toBeUndefined();
    });
    it('never treats an empty-repository read as write proof', async () => {
        const check = await mapProbeResponse({ ...requirement, probe: 'contents', permission: 'Contents', level: 'write' },
            new Response(null, { status: 409 }), 'permission-bound', 'owner');
        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('does not prove') });
        expect(check.writeProof).toBeUndefined();
    });
});
