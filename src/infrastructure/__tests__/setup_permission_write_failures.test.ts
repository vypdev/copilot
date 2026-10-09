import { SetupPermissionProbeHttp, writeProbeFailure } from '../setup_permission_probe_http';
import type { ResourceProbeContext } from '../setup_permission_probe_context';
import type { SetupPermissionProbeJournal } from '../setup_permission_probe_journal';
import { probeDisposableResource } from '../setup_permission_resource_probes';
import { hasWorkflowDispatch } from '../setup_permission_actions_probe';
import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';

const sha = 'a'.repeat(40);
const workflowPath = '.github/workflows/check.yml';
const workflow = { id: 123, path: workflowPath, state: 'active' };
const file = { encoding: 'base64', sha, content: Buffer.from('on: workflow_dispatch\n').toString('base64') };
const reply = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });
type Override = (path: string, method: string, body: Record<string, unknown>, url: URL) => Response | undefined;

/** Isolate probe decisions; ownership-aware journal cleanup is exercised in its contract suites. */
function fixture(probe: ResourceProbeContext['probe'], override: Override = () => undefined) {
    let name = '';
    let written: Record<string, unknown> = {};
    let created: Record<string, unknown> = {};
    const handle = {
        cleanup: jest.fn().mockResolvedValue(undefined), dismiss: jest.fn().mockResolvedValue(undefined),
        setReferenceSha: jest.fn().mockResolvedValue(undefined), markPullAttempted: jest.fn().mockResolvedValue(undefined),
        clearRejectedPull: jest.fn().mockResolvedValue(undefined), setDispatchWorkflowId: jest.fn().mockResolvedValue(undefined),
        markDispatchAttempted: jest.fn().mockResolvedValue(undefined), clearRejectedDispatch: jest.fn().mockResolvedValue(undefined),
        setRunId: jest.fn().mockResolvedValue(undefined), setRemoteId: jest.fn().mockResolvedValue(undefined),
    };
    const begin = jest.fn().mockResolvedValue(handle);
    const fetcher = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        const path = url.pathname;
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
        const overridden = override(path, method, body, url);
        if (overridden) return overridden;
        if (path === '/repos/owner/repo') return reply(200, { default_branch: 'main', id: 1 });
        if (path === '/repos/owner/repo/git/ref/heads/main') return reply(200, { object: { sha } });
        if (path.includes('/git/ref/heads/')) return reply(404);
        if (path.endsWith('/git/refs') && method === 'POST') {
            name = String(body.ref).slice('refs/heads/'.length);
            return reply(201);
        }
        if (path.endsWith('/actions/workflows')) return reply(200, { workflows: [workflow], total_count: 1 });
        if (path.includes('/contents/') && method === 'PUT') { written = body; return reply(path.endsWith('.yml') ? 200 : 201, { commit: { sha } }); }
        if (path.includes('/contents/') && method === 'GET') return url.searchParams.get('ref') === sha
            ? reply(200, file) : reply(200, { path: workflowPath, encoding: 'base64', content: written.content });
        if (path.endsWith('/dispatches')) return reply(200, { workflow_run_id: 77 });
        if (path.endsWith('/actions/runs/77')) return reply(200, { id: 77, head_branch: name, event: 'workflow_dispatch', workflow_id: 123 });
        if (path.endsWith('/actions/runs')) return reply(200, { workflow_runs: [{ id: 77, head_branch: name, event: 'workflow_dispatch', workflow_id: 123 }] });
        if (path.endsWith('/pulls') && method === 'POST') { created = body; return reply(201, { number: 42 }); }
        if (path.endsWith('/pulls/42')) return reply(200, { number: 42, title: created.title, state: 'open', head: { ref: name } });
        throw new Error(`Unhandled local fixture ${method} ${path}`);
    }) as unknown as jest.MockedFunction<typeof fetch>;
    const context: ResourceProbeContext = { owner: 'owner', repository: 'repo', scope: 'repository', probe,
        http: new SetupPermissionProbeHttp(fetcher, 'fixture-token', 1000),
        journal: { begin, recover: jest.fn().mockResolvedValue(undefined) } as unknown as SetupPermissionProbeJournal, phase: jest.fn() };
    return { context, fetcher, begin, handle };
}

describe('write-probe rejection and readback contracts', () => {
    it.each(['branch', 'override', 'workflow'] as const)('streams the bounded %s prerequisite through the production audit adapter', async stage => {
        const value = fixture('actions', (path, method) => {
            if (stage === 'branch' && path.endsWith('/git/refs') && method === 'POST') return reply(403);
            if (stage === 'override' && path.includes('/contents/') && method === 'PUT') return reply(403);
            if (stage === 'workflow' && path.endsWith('/actions/workflows')) return reply(200, { workflows: [] });
            return undefined;
        });
        const progress = jest.fn();
        const checks = await new SetupTokenPermissionQueryAdapter({ fetcher: value.fetcher, journal: value.context.journal })
            .inspect('owner', 'repo', 'fixture-token', [{ id: 'actions', role: 'setup', scope: 'repository', permission: 'Actions',
                level: 'write', applicability: 'required', reason: 'test', probe: 'actions' }], progress);
        expect(checks[0].status).toBe('unverifiable');
        expect(progress).toHaveBeenLastCalledWith({ role: 'setup', requirementId: 'actions', phase: 'failed', detail: checks[0].prerequisite });
        expect(checks[0].prerequisite).toBeDefined();
    });

    it.each([
        ['branch', 'contents-write'], ['override', 'contents-workflows-write'], ['workflow', 'dispatch-workflow'],
    ] as const)('reports an Actions %s prerequisite without claiming its grant is missing', async (stage, prerequisite) => {
        const value = fixture('actions', (path, method) => {
            if (stage === 'branch' && path.endsWith('/git/refs') && method === 'POST') return reply(403, { message: 'Resource not accessible by personal access token' });
            if (stage === 'override' && path.includes('/contents/') && method === 'PUT') return reply(403, { message: 'Resource not accessible by personal access token' });
            if (stage === 'workflow' && path.endsWith('/actions/workflows')) return reply(200, { workflows: [], total_count: 0 });
            return undefined;
        });
        const error = await probeDisposableResource(value.context).catch((caught: unknown) => caught);
        const check = writeProbeFailure({ id: 'actions', role: 'setup', scope: 'repository', permission: 'Actions',
            level: 'write', applicability: 'required', reason: 'test', probe: 'actions' }, error);
        expect(check).toMatchObject({ status: 'unverifiable', prerequisite });
        expect(value.handle.markDispatchAttempted).not.toHaveBeenCalled();
        expect(value.handle.cleanup).toHaveBeenCalledTimes(stage === 'workflow' ? 0 : 1);
    });

    it.each([422, 500])('preserves HTTP %s from an override failure instead of inventing a permission denial', async status => {
        const value = fixture('actions', (path, method) => path.includes('/contents/') && method === 'PUT' ? reply(status) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toMatchObject({ httpStatus: status, prerequisite: undefined });
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
        expect(value.handle.markDispatchAttempted).not.toHaveBeenCalled();
    });

    it.each(['actions', 'pull-requests', 'contents'] as const)('rejects unsafe %s base metadata before mutation', async probe => {
        const value = fixture(probe, path => path === '/repos/owner/repo' ? reply(200, { default_branch: '/unsafe' }) : undefined);
        // Contents accepts encoded ref names but rejects control bytes.
        if (probe === 'contents') value.fetcher.mockResolvedValueOnce(reply(200, { default_branch: '\u0000' }));
        await expect(probeDisposableResource(value.context)).rejects.toThrow('safe');
        expect(value.begin).not.toHaveBeenCalled();
    });

    it.each(['actions', 'pull-requests', 'contents'] as const)('rejects missing and malformed %s base commits', async probe => {
        for (const object of [null, { sha: 'invalid' }]) {
            const value = fixture(probe, path => path.endsWith('/heads/main') ? reply(200, { object }) : undefined);
            await expect(probeDisposableResource(value.context)).rejects.toThrow(/commit/u);
            expect(value.begin).not.toHaveBeenCalled();
        }
    });

    it.each(['actions', 'pull-requests', 'contents'] as const)('never overwrites an existing %s probe branch', async probe => {
        const value = fixture(probe, path => path.includes('/heads/copilot-permission-test-') ? reply(200) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('absence');
        expect(value.begin).not.toHaveBeenCalled();
    });

    it.each([
        { workflows: {}, total_count: 1 }, { workflows: Array(101).fill(workflow) },
        { workflows: [workflow], total_count: -1 }, { workflows: [workflow], total_count: 2 },
    ])('rejects invalid or incomplete workflow inventory %j before mutation', async inventory => {
        const value = fixture('actions', path => path.endsWith('/actions/workflows') ? reply(200, inventory) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow(/workflow/u);
        expect(value.begin).not.toHaveBeenCalled();
    });

    it.each([
        { status: 404, payload: {} }, { status: 200, payload: { ...file, sha: 'invalid' } },
        { status: 200, payload: { ...file, content: Buffer.from('on: push').toString('base64') } },
    ])('never dispatches an unrecognized default workflow %j', async ({ status, payload }) => {
        const value = fixture('actions', (path, _method, _body, url) => path.includes('/contents/')
            && url.searchParams.get('ref') === sha ? reply(status, payload) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('No active');
        expect(value.begin).not.toHaveBeenCalled();
    });

    it.each([422, 500])('cleans an Actions branch when its creation returns HTTP %s', async status => {
        const value = fixture('actions', (path, method) => path.endsWith('/git/refs') && method === 'POST' ? reply(status) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('HTTP');
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
        expect(value.handle.markDispatchAttempted).not.toHaveBeenCalled();
    });

    it('cleans the branch when the no-job override cannot be written', async () => {
        const value = fixture('actions', (path, method) => path.includes('/contents/') && method === 'PUT' ? reply(403) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('Workflows Write');
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
        expect(value.handle.markDispatchAttempted).not.toHaveBeenCalled();
    });

    it('refuses to dispatch when the isolated no-job file readback differs', async () => {
        const value = fixture('actions', (path, method, _body, url) => method === 'GET' && path.includes('/contents/')
            && url.searchParams.get('ref') !== sha ? reply(200, { path: workflowPath, encoding: 'base64', content: file.content }) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('no-job workflow');
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
        expect(value.handle.markDispatchAttempted).not.toHaveBeenCalled();
    });

    it.each([403, 500])('preserves dispatch uncertainty appropriately for HTTP %s', async status => {
        const value = fixture('actions', path => path.endsWith('/dispatches') ? reply(status) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('dispatch');
        expect(value.handle.clearRejectedDispatch).toHaveBeenCalledTimes(status === 403 ? 1 : 0);
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
    });

    it.each([0, '77'])('rejects an invalid accepted run identity %j', async id => {
        const value = fixture('actions', path => path.endsWith('/dispatches') ? reply(200, { workflow_run_id: id }) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('identify');
        expect(value.handle.setRunId).not.toHaveBeenCalled();
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
    });

    it('rejects run readback for another workflow and still requests cleanup', async () => {
        const value = fixture('actions', path => path.endsWith('/actions/runs/77') ? reply(200, { id: 77, workflow_id: 999 }) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('readback');
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
    });

    it('blocks a successful transaction if cleanup fails', async () => {
        const value = fixture('actions');
        value.handle.cleanup.mockRejectedValue(new Error('private transport failure'));
        await expect(probeDisposableResource(value.context)).rejects.toMatchObject({ cleanupPending: true });
    });

    it.each(['malformed', 'duplicate', 'invalid-id', 'delayed', 'absent'] as const)(
        'handles %s fallback run discovery conservatively', async scenario => {
            const value = fixture('actions', (path, _method, _body, url) => {
                if (path.endsWith('/dispatches')) return reply(204);
                if (!path.endsWith('/actions/runs')) return undefined;
                const run = { id: scenario === 'invalid-id' ? 0 : 77, head_branch: url.searchParams.get('branch'), event: 'workflow_dispatch', workflow_id: 123 };
                return reply(200, { workflow_runs: scenario === 'malformed' ? null : scenario === 'duplicate'
                    ? [run, run] : scenario === 'absent' ? [] : [run] });
            });
            if (scenario === 'delayed') {
                // One eventually consistent empty response precedes the exact run.
                const original = value.fetcher.getMockImplementation()!;
                let empty = true;
                value.fetcher.mockImplementation(async (input, init) => {
                    if (String(input).includes('/actions/runs?') && empty) { empty = false; return reply(200, { workflow_runs: [] }); }
                    return original(input, init);
                });
                await expect(probeDisposableResource(value.context)).resolves.toBeUndefined();
                expect(value.handle.setRunId).toHaveBeenCalledWith(77);
            } else await expect(probeDisposableResource(value.context)).rejects.toThrow(/run/u);
            expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
        });

    it.each([403, 500])('retains uncertainty about PR creation on HTTP %s', async status => {
        const value = fixture('pull-requests', (path, method) => path.endsWith('/pulls') && method === 'POST' ? reply(status) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('creation');
        expect(value.handle.clearRejectedPull).toHaveBeenCalledTimes(status === 403 ? 1 : 0);
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
    });

    it('rejects an unidentified PR and still requests branch cleanup', async () => {
        const value = fixture('pull-requests', (path, method) => path.endsWith('/pulls') && method === 'POST' ? reply(201, { number: 0 }) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('identify');
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
    });

    it('rejects PR readback that does not name its temporary head', async () => {
        const value = fixture('pull-requests', path => path.endsWith('/pulls/42') ? reply(200, { number: 42, head: { ref: 'foreign' } }) : undefined);
        await expect(probeDisposableResource(value.context)).rejects.toThrow('readback');
        expect(value.handle.cleanup).toHaveBeenCalledTimes(1);
    });

    it.each(['[', 'null', '[]'])('rejects malformed workflow YAML %s', content => {
        expect(hasWorkflowDispatch(content)).toBe(false);
    });
});
