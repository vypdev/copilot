import { probeDisposableResource } from '../setup_permission_resource_probes';
import { SetupPermissionProbeHttp } from '../setup_permission_probe_http';
import type { ResourceProbeContext } from '../setup_permission_probe_context';
import type { SetupPermissionProbeJournal } from '../setup_permission_probe_journal';

const reply = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const sha = 'a'.repeat(40);
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

function fixture(probe: ResourceProbeContext['probe'], fetcher: Fetch, scope: ResourceProbeContext['scope'] = 'repository') {
    const handle = { cleanup: jest.fn().mockResolvedValue(undefined), dismiss: jest.fn().mockResolvedValue(undefined),
        setRemoteId: jest.fn().mockResolvedValue(undefined), setReferenceSha: jest.fn().mockResolvedValue(undefined) };
    const begin = jest.fn().mockResolvedValue(handle);
    const context: ResourceProbeContext = { probe, scope, owner: 'owner', repository: 'repo',
        http: new SetupPermissionProbeHttp(fetcher as typeof fetch, 'fixture-token', 1000),
        journal: { begin } as unknown as SetupPermissionProbeJournal, phase: jest.fn() };
    return { context, begin, handle };
}

describe('resource ownership failures', () => {
    it('never creates a Variable when absence is ambiguous', async () => {
        const fetcher = jest.fn(async () => reply(403));
        const value = fixture('variables', fetcher);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('absence');
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(value.begin).not.toHaveBeenCalled();
    });

    it('rejects a malformed Secret key before any write or journal', async () => {
        const value = fixture('secrets', async () => reply(200, { key_id: 'fixture' }));
        await expect(probeDisposableResource(value.context)).rejects.toThrow('public key');
        expect(value.begin).not.toHaveBeenCalled();
    });

    it('dismisses a definitively rejected Secret create without requesting deletion', async () => {
        const value = fixture('secrets', async (url, init) => {
            if (url.endsWith('/public-key')) return reply(200, { key: Buffer.alloc(32, 1).toString('base64'), key_id: 'fixture' });
            return reply(init?.method === 'PUT' ? 401 : 404);
        });
        await expect(probeDisposableResource(value.context)).rejects.toMatchObject({ httpStatus: 401 });
        expect(value.handle.dismiss).toHaveBeenCalledTimes(1);
        expect(value.handle.cleanup).not.toHaveBeenCalled();
    });

    it('rejects Secret metadata for another name and still requests owned-resource cleanup', async () => {
        let created = false;
        const value = fixture('secrets', async (url, init) => {
            if (url.endsWith('/public-key')) return reply(200, { key: Buffer.alloc(32, 1).toString('base64'), key_id: 'fixture' });
            if (init?.method === 'PUT') { created = true; return reply(201); }
            return created ? reply(200, { name: 'foreign' }) : reply(404);
        });
        await expect(probeDisposableResource(value.context)).rejects.toThrow('readback');
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
    });

    it.each(['invalid-id', 'missing-readback'] as const)('cleans an Issue Type after %s', async scenario => {
        const value = fixture('issue-types', async (_url, init) => {
            const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
            return init?.method === 'POST' ? reply(201, { id: scenario === 'invalid-id' ? 0 : 1, name: body.name }) : reply(200, []);
        }, 'organization');
        await expect(probeDisposableResource(value.context)).rejects.toThrow(/Issue Type/u);
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
    });

    it.each(['contents', 'workflows'] as const)('rejects a %s readback for a foreign resource', async probe => {
        let created = false;
        const value = fixture(probe, async (url, init) => {
            if (url === 'https://api.github.com/repos/owner/repo') return reply(200, { default_branch: 'main' });
            if (url.endsWith('/heads/main')) return reply(200, { object: { sha } });
            if (url.endsWith('/git/refs') && init?.method === 'POST') { created = true; return reply(201); }
            if (init?.method === 'PUT') return reply(201, { commit: { sha } });
            if (!created) return reply(404);
            return reply(200, { path: 'foreign', ref: 'refs/heads/foreign', object: { sha }, type: 'file', encoding: 'base64', content: '' });
        });
        await expect(probeDisposableResource(value.context)).rejects.toThrow('readback');
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
    });

    it('rejects a malformed Project owner before creating a cleanup record', async () => {
        const value = fixture('projects', async () => reply(200, { node_id: 'bad' }), 'organization');
        await expect(probeDisposableResource(value.context)).rejects.toThrow('organization node ID');
        expect(value.begin).not.toHaveBeenCalled();
    });

    it.each(['graphql-denial', 'missing-data', 'missing-project', 'invalid-id', 'foreign-readback', 'cleanup-failure'] as const)(
        'fails the Project transaction safely after %s', async scenario => {
            let title = '';
            const value = fixture('projects', async (url, init) => {
                if (url.includes('/orgs/')) return reply(200, { node_id: 'O_fixture123' });
                const body = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string> };
                if (body.query.includes('createProjectV2')) {
                    title = body.variables.title;
                    if (scenario === 'graphql-denial') return reply(200, { errors: [{ message: 'private account data' }] });
                    if (scenario === 'missing-data') return reply(200, {});
                    if (scenario === 'missing-project') return reply(200, { data: { createProjectV2: null } });
                    return reply(200, { data: { createProjectV2: { projectV2: { id: scenario === 'invalid-id' ? 'bad' : 'PVT_fixture123', title } } } });
                }
                return reply(200, { data: { node: { id: 'PVT_fixture123', title: scenario === 'foreign-readback' ? 'foreign' : title } } });
            }, 'organization');
            if (scenario === 'cleanup-failure') value.handle.cleanup.mockRejectedValue(new Error('private failure'));
            await expect(probeDisposableResource(value.context)).rejects.toThrow(/Project/u);
            expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
            expect(value.handle.setRemoteId).toHaveBeenCalledTimes(['foreign-readback', 'cleanup-failure'].includes(scenario) ? 1 : 0);
        });
});
