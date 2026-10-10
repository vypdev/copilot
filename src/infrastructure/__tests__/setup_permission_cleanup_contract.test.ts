import { cleanupActionRun, cleanupPullRequest } from '../setup_permission_workflow_cleanup';
import { cleanupProject } from '../setup_permission_project_cleanup';
import { SetupPermissionProbeHttp } from '../setup_permission_probe_http';

const root = 'https://api.github.com/repos/owner/repo';
const name = `copilot-permission-test-${'a'.repeat(32)}`;
const title = `Copilot permission test ${'a'.repeat(32)}`;
const projectId = 'PVT_12345678';
const pr = { number: 7, title, head: { ref: name }, state: 'closed', merged_at: null };
const run = { id: 7, head_branch: name, event: 'workflow_dispatch', workflow_id: 123, status: 'completed' };
const reply = (body: unknown, status = 200) => ({ body, status });
const gql = (data: unknown) => reply({ data });
function fixture(...responses: ReturnType<typeof reply>[]) {
    let index = 0;
    const fetcher = jest.fn(async (_url: string | URL | Request, _options?: RequestInit) => {
        const response = responses[Math.min(index++, responses.length - 1)];
        return new Response(response.status === 204 || response.status === 404 ? null : JSON.stringify(response.body),
            { status: response.status });
    });
    return { http: new SetupPermissionProbeHttp(fetcher, 'fixture', 1000), fetcher };
}
function methods(fetcher: jest.Mock): string[] {
    return fetcher.mock.calls.map(call => call[1].method);
}

describe('temporary PAT cleanup ownership contracts', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('does not close unrelated PRs or require a remote resource when none matches', async () => {
        const { http, fetcher } = fixture(reply([{ ...pr, title: 'other' },
            { ...pr, head: { ref: 'other' } }]));
        await cleanupPullRequest(http, root, 'owner', name);
        expect(methods(fetcher)).toEqual(['GET']);
    });
    it.each([
        {}, [null], [[]], [{}], [{ ...pr, head: null }], [pr, pr], [{ ...pr, number: 0 }], [{ ...pr, number: -1 }], [{ ...pr, number: '7' }],
        [{ ...pr, merged_at: '2026-10-06' }], [{ ...pr, state: 'unexpected' }],
    ])('retains malformed, ambiguous, merged or changed PRs: %j', async rows => {
        const { http, fetcher } = fixture(reply(rows));
        await expect(cleanupPullRequest(http, root, 'owner', name)).rejects.toThrow(/temporary|Temporary/u);
        expect(methods(fetcher)).toEqual(['GET']);
    });
    it('drops malformed PR JSON instead of exposing the provider payload during cleanup', async () => {
        const fetcher = jest.fn().mockResolvedValue(new Response('private provider payload'));
        const error = await cleanupPullRequest(new SetupPermissionProbeHttp(fetcher, 'fixture', 1000), root, 'owner', name)
            .catch(error => error);
        expect(error.message).toContain('invalid temporary pull-request');
        expect(error.message).not.toContain('private provider payload');
    });
    it.each([{ ...pr, number: 8 }, { ...pr, state: 'open' }, { ...pr, title: 'other' }])(
        'rejects an inconsistent closure readback %j', async after => {
            const { http } = fixture(reply([pr]), reply(after));
            await expect(cleanupPullRequest(http, root, 'owner', name)).rejects.toThrow('closure');
        });
    it.each(['open', 'closed'])('closes or rechecks the exact owned %s draft', async state => {
        const { http, fetcher } = state === 'open'
            ? fixture(reply([{ ...pr, state }]), reply(pr), reply(pr)) : fixture(reply([pr]), reply(pr));
        await cleanupPullRequest(http, root, 'owner', name);
        expect(methods(fetcher)).toEqual(state === 'open' ? ['GET', 'PATCH', 'GET'] : ['GET', 'GET']);
    });

    it('does not look for an Actions run before dispatch was attempted', async () => {
        const { http, fetcher } = fixture(reply({}));
        await cleanupActionRun(http, root, name);
        expect(fetcher).not.toHaveBeenCalled();
    });
    it.each([
        {}, { workflow_runs: [null] }, { workflow_runs: [[]] }, { workflow_runs: [{}] },
        { workflow_runs: [run, run] }, { workflow_runs: [{ ...run, id: 0 }] },
    ])('blocks invalid or ambiguous Actions recovery %j', async body => {
        const { http, fetcher } = fixture(reply(body));
        await expect(cleanupActionRun(http, root, name, undefined, true, 123)).rejects.toThrow(/temporary|Temporary/u);
        expect(methods(fetcher)).toEqual(['GET']);
    });
    it('recovers only the selected workflow and ignores unrelated list entries', async () => {
        const { http, fetcher } = fixture(reply({ workflow_runs: [{ ...run, event: 'push' },
            { ...run, head_branch: 'other' }, { ...run, workflow_id: 321 }, run] }), reply(run), reply(null, 204), reply(null, 404));
        await cleanupActionRun(http, root, name, undefined, true, 123);
        expect(methods(fetcher)).toEqual(['GET', 'GET', 'DELETE', 'GET']);
    });
    it.each([undefined, 321])('refuses to delete a run without matching workflow ownership %s', async workflowId => {
        const { http, fetcher } = fixture(reply(run));
        await expect(cleanupActionRun(http, root, name, 7, true, workflowId)).rejects.toThrow('identity changed');
        expect(methods(fetcher)).toEqual(['GET']);
    });
    it.each([{ ...run, id: 8 }, { ...run, head_branch: 'other' }, { ...run, event: 'push' }])(
        'retains mismatched run identities %j', async body => {
            const { http, fetcher } = fixture(reply(body));
            await expect(cleanupActionRun(http, root, name, 7, true, 123)).rejects.toThrow('identity changed');
            expect(methods(fetcher)).toEqual(['GET']);
        });
    it('rejects unavailable run lookup rather than claiming absence', async () => {
        const { http } = fixture(reply({}, 503));
        await expect(cleanupActionRun(http, root, name, 7, true, 123)).rejects.toThrow('HTTP 503');
    });
    it('does not confirm run deletion while the exact run still exists', async () => {
        const { http } = fixture(reply(run), reply(null, 204), reply(run));
        await expect(cleanupActionRun(http, root, name, 7, true, 123)).rejects.toThrow('deletion');
    });
    it.each([202, 409, 403])('handles cancellation response %s without deleting an active run', async status => {
        const { http, fetcher } = fixture(reply({ ...run, status: 'queued' }), reply({}, status), reply(run),
            reply(null, 204), reply(null, 404));
        const result = cleanupActionRun(http, root, name, 7, true, 123).catch(error => error);
        await jest.advanceTimersByTimeAsync(1000);
        if (status === 403) {
            expect(await result).toHaveProperty('message', expect.stringContaining('cancellation'));
            expect(methods(fetcher)).not.toContain('DELETE');
        } else {
            expect(await result).toBeUndefined();
            expect(methods(fetcher)).toEqual(['GET', 'POST', 'GET', 'DELETE', 'GET']);
        }
    });
    it.each(['unidentified', 'absent', 'running'] as const)('bounds recovery of an %s run', async state => {
        const { http, fetcher } = state === 'unidentified' ? fixture(reply({ workflow_runs: [] }))
            : state === 'absent' ? fixture(reply(null, 404))
                : fixture(reply({ ...run, status: 'queued' }), reply({}, 202), reply({ ...run, status: 'queued' }));
        const result = cleanupActionRun(http, root, name, state === 'unidentified' ? undefined : 7, true, 123)
            .catch(error => error);
        await jest.advanceTimersByTimeAsync(60000);
        if (state === 'absent') expect(await result).toBeUndefined();
        else expect(await result).toBeInstanceOf(Error);
        expect(methods(fetcher)).not.toContain('DELETE');
        expect(fetcher.mock.calls.length).toBeLessThanOrEqual(16);
    });

    it.each([null, [], {}, { id: 'PVT_87654321', title }, { id: projectId, title: 'other' }])(
        'retains a changed Project identity %j', async node => {
            const { http, fetcher } = fixture(gql({ node }));
            if (node === null) await cleanupProject(http, 'owner', title, projectId);
            else await expect(cleanupProject(http, 'owner', title, projectId)).rejects.toThrow('identity changed');
            expect(fetcher).toHaveBeenCalledTimes(1);
        });
    it.each([null, [], {}, { projectV2: null }, { projectV2: { id: 'other' } }])(
        'does not accept an unconfirmed deletion %j', async deleted => {
            const { http } = fixture(gql({ node: { id: projectId, title } }), gql({ deleteProjectV2: deleted }));
            await expect(cleanupProject(http, 'owner', title, projectId)).rejects.toThrow('confirm deletion');
        });
    it('requires confirmed absence after matching Project deletion', async () => {
        const { http } = fixture(gql({ node: { id: projectId, title } }),
            gql({ deleteProjectV2: { projectV2: { id: projectId } } }), gql({ node: { id: projectId, title } }));
        await expect(cleanupProject(http, 'owner', title, projectId)).rejects.toThrow('cleanup could not be confirmed');
    });
    const missingProject = { data: { node: null }, errors: [{ type: 'NOT_FOUND', path: ['node'] }] };
    const emptyProjects = { organization: { projectsV2: { nodes: [], pageInfo: { hasNextPage: false } } } };
    it('confirms GitHub node-scoped NOT_FOUND after deletion through a complete authorized title lookup', async () => {
        const { http, fetcher } = fixture(gql({ node: { id: projectId, title } }),
            gql({ deleteProjectV2: { projectV2: { id: projectId } } }), reply(missingProject), gql(emptyProjects));
        await cleanupProject(http, 'owner', title, projectId);
        expect(fetcher).toHaveBeenCalledTimes(4);
        expect(JSON.parse(String(fetcher.mock.calls[3][1]?.body)).variables).toEqual({ owner: 'owner', title, after: null });
    });
    it('recovers an already deleted Project without another deletion', async () => {
        const { http, fetcher } = fixture(reply(missingProject), gql(emptyProjects));
        await cleanupProject(http, 'owner', title, projectId);
        expect(fetcher.mock.calls.every(call => !String(call[1]?.body).includes('mutation'))).toBe(true);
    });
    it.each([
        { data: { node: null }, errors: [{ type: 'FORBIDDEN', path: ['node'] }] },
        { data: { node: null }, errors: [{ type: 'INSUFFICIENT_SCOPES', path: ['node'] }] },
        { data: { node: null }, errors: [{ type: 'NOT_FOUND', path: ['organization'] }] },
        { data: { node: null }, errors: [{ type: 'NOT_FOUND', path: ['node', 'title'] }] },
        { data: { node: null }, errors: [...missingProject.errors, { type: 'FORBIDDEN', path: ['node'] }] },
        { data: { node: { id: projectId, title } }, errors: missingProject.errors },
        { data: { node: null }, errors: 'private provider error' },
    ])('does not infer Project absence from scope errors or contradictory data %j', async body => {
        const { http, fetcher } = fixture(reply(body));
        await expect(cleanupProject(http, 'owner', title, projectId)).rejects.toThrow('rejected');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it.each([
        { errors: [{ type: 'FORBIDDEN' }], data: emptyProjects },
        { data: { organization: { projectsV2: { nodes: [{ id: projectId, title }], pageInfo: { hasNextPage: false } } } } },
        { data: { organization: { projectsV2: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'next' } } } } },
    ])('keeps recovery blocked when the NOT_FOUND corroboration is denied, contradictory or incomplete %j', async lookup => {
        const { http } = fixture(reply(missingProject), reply(lookup));
        await expect(cleanupProject(http, 'owner', title, projectId)).rejects.toThrow(/cleanup|bounded/u);
    });
    it.each([{ errors: [{}] }, { data: null }, { data: [] }])('rejects malformed GraphQL cleanup %j', async body => {
        const { http } = fixture(reply(body));
        await expect(cleanupProject(http, 'owner', title, projectId)).rejects.toThrow(/cleanup/u);
    });
    it.each([
        { organization: null }, { organization: { projectsV2: null } },
        { organization: { projectsV2: { nodes: {} } } },
        { organization: { projectsV2: { nodes: [{ id: 'bad', title }] } } },
        { organization: { projectsV2: { nodes: [], pageInfo: null } } },
        { organization: { projectsV2: { nodes: [], pageInfo: [] } } },
        { organization: { projectsV2: { nodes: [], pageInfo: { hasNextPage: true } } } },
        { organization: { projectsV2: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'a'.repeat(257) } } } },
        { organization: { projectsV2: { nodes: [], pageInfo: { hasNextPage: 'true' } } } },
    ])('rejects malformed or unbounded filtered Project recovery %j', async data => {
        const { http } = fixture(gql(data));
        await expect(cleanupProject(http, 'owner', title)).rejects.toThrow(/cleanup|Projects|Project ID/u);
    });
    it('does not delete an unrelated Project found by the title search', async () => {
        const { http, fetcher } = fixture(gql({ organization: { projectsV2: {
            nodes: [{ id: projectId, title: 'other' }], pageInfo: { hasNextPage: false },
        } } }));
        await cleanupProject(http, 'owner', title);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
    it('rejects duplicate exact Projects instead of choosing one to delete', async () => {
        const { http } = fixture(gql({ organization: { projectsV2: { nodes: [{ id: projectId, title }, { id: projectId, title }],
            pageInfo: { hasNextPage: false } } } }));
        await expect(cleanupProject(http, 'owner', title)).rejects.toThrow('Multiple Projects');
    });
    it('bounds an incomplete filtered Project search to five pages', async () => {
        const { http, fetcher } = fixture(gql({ organization: { projectsV2: { nodes: [],
            pageInfo: { hasNextPage: true, endCursor: 'next' } } } }));
        await expect(cleanupProject(http, 'owner', title)).rejects.toThrow('bounded organization scan');
        expect(fetcher).toHaveBeenCalledTimes(5);
    });
});
