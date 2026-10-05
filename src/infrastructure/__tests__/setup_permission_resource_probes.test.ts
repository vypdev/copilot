import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupPermissionProbeJournal } from '../setup_permission_probe_journal';
import { SetupPermissionProbeHttp, writeProbeFailure } from '../setup_permission_probe_http';
import { probeDisposableResource } from '../setup_permission_resource_probes';
import type { ResourceProbeContext } from '../setup_permission_probe_context';
import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import { hasWorkflowDispatch } from '../setup_permission_actions_probe';

type RequestOptions = RequestInit & { method?: string };
const reply = (status: number, payload?: unknown) => ({
    status, ok: status >= 200 && status < 300,
    json: async () => payload,
}) as Response;

// GitHub's Contents API serves the committed blob. Windows may check out this
// fixture with CRLF, while the committed workflow and its trusted hash use LF.
const committedHealthWorkflow = async () =>
    (await readFile(join(process.cwd(), 'setup/workflows/copilot_credential_health.yml'), 'utf8'))
        .replace(/\r\n/gu, '\n');

describe('temporary permission resource probes', () => {
    it('bounds a GitHub response that sends headers but never finishes its body', async () => {
        let signal: AbortSignal | undefined;
        const fetcher = jest.fn(async (_url: string, options?: RequestInit) => {
            signal = options?.signal as AbortSignal;
            return { status: 200, text: () => new Promise<string>(() => undefined) } as Response;
        }) as unknown as typeof fetch;
        const http = new SetupPermissionProbeHttp(fetcher, 'fixture-token', 20);

        await expect(http.expect('https://api.github.com/repos/owner/repo', 'GET', [200]))
            .rejects.toThrow('GitHub GET did not complete or timed out.');
        expect(signal?.aborted).toBe(true);
    });

    it.each([
        ['on: workflow_dispatch', true],
        ['on: [push, workflow_dispatch]', true],
        ['on:\n  push:\n  workflow_dispatch:', true],
        ['on: [push]\n# workflow_dispatch:', false],
        ['on: push\njobs:\n  example:\n    name: workflow_dispatch:', false],
    ])('recognizes only a top-level GitHub dispatch trigger in %s', (source, expected) => {
        expect(hasWorkflowDispatch(source)).toBe(expected);
    });
    let folder: string;
    beforeEach(async () => { folder = await mkdtemp(join(tmpdir(), 'copilot-probe-test-')); });
    afterEach(async () => { await rm(folder, { recursive: true, force: true }); });

    function context(probe: ResourceProbeContext['probe'], scope: ResourceProbeContext['scope'], fetcher: typeof fetch) {
        const phases: string[] = [];
        const journal = new SetupPermissionProbeJournal(folder);
        return { phases, journal, value: {
            owner: 'owner', repository: 'repo', probe, scope,
            http: new SetupPermissionProbeHttp(fetcher, 'fixture-token', 1000), journal,
            phase: (phase: 'creating' | 'reading' | 'deleting') => phases.push(phase),
        } satisfies ResourceProbeContext };
    }

    it.each(['repository', 'organization'] as const)('creates, reads and deletes a %s Variable', async scope => {
        const root = scope === 'organization' ? '/orgs/owner/actions/variables' : '/repos/owner/repo/actions/variables';
        let variable: { name: string; value: string } | undefined;
        const calls: string[] = [];
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            calls.push(`${method} ${path}`);
            if (path === '/repos/owner/repo' && method === 'GET') return reply(200, { id: 123 });
            if (path === root && method === 'POST') {
                const body = JSON.parse(String(options?.body)) as { name: string; value: string; visibility?: string; selected_repository_ids?: number[] };
                expect(body.visibility).toBe(scope === 'organization' ? 'selected' : undefined);
                if (scope === 'organization') expect(body.selected_repository_ids).toEqual([123]);
                variable = body;
                return reply(201);
            }
            if (path.startsWith(`${root}/`) && method === 'GET') return variable ? reply(200, variable) : reply(404);
            if (path.startsWith(`${root}/`) && method === 'DELETE') { variable = undefined; return reply(204); }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('variables', scope, fetcher);
        await probeDisposableResource(probe.value);
        expect(probe.phases).toEqual(['creating', 'reading', 'deleting']);
        expect(calls.filter(call => call.startsWith('DELETE '))).toHaveLength(1);
        expect(variable).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
    });

    it('creates a draft pull request on a disposable branch, reads it, closes it and removes the branch', async () => {
        const sha = 'a'.repeat(40);
        let branch: string | undefined;
        let file = false;
        let pull: { number: number; title: string; state: string; head: { ref: string }; merged_at: null } | undefined;
        const calls: string[] = [];
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const parsed = new URL(url);
            const path = parsed.pathname;
            const method = options?.method ?? 'GET';
            calls.push(`${method} ${path}`);
            const root = '/repos/owner/repo';
            if (path === root) return reply(200, { default_branch: 'main' });
            if (path === `${root}/git/ref/heads/main`) return reply(200, { object: { sha } });
            if (path === `${root}/git/refs` && method === 'POST') {
                branch = (JSON.parse(String(options?.body)) as { ref: string }).ref.slice('refs/heads/'.length);
                return reply(201);
            }
            if (path.startsWith(`${root}/git/ref/heads/copilot-permission-test-`) && method === 'GET') {
                return branch ? reply(200, { ref: `refs/heads/${branch}` }) : reply(404);
            }
            if (path.startsWith(`${root}/git/refs/heads/copilot-permission-test-`) && method === 'DELETE') {
                branch = undefined; return reply(204);
            }
            if (path.startsWith(`${root}/contents/.copilot-permission-test/`) && method === 'PUT') {
                expect((JSON.parse(String(options?.body)) as { branch: string }).branch).toBe(branch);
                file = true; return reply(201);
            }
            if (path === `${root}/pulls` && method === 'POST') {
                const body = JSON.parse(String(options?.body)) as { title: string; head: string; draft: boolean };
                expect(body.head).toBe(branch);
                expect(body.draft).toBe(true);
                pull = { number: 42, title: body.title, state: 'open', head: { ref: body.head }, merged_at: null };
                return reply(201, pull);
            }
            if (path === `${root}/pulls` && method === 'GET') return reply(200, pull ? [pull] : []);
            if (path === `${root}/pulls/42` && method === 'PATCH') {
                pull = { ...pull!, state: 'closed' }; return reply(200, pull);
            }
            if (path === `${root}/pulls/42` && method === 'GET') return reply(200, pull);
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('pull-requests', 'repository', fetcher);
        await probeDisposableResource(probe.value);
        expect(file).toBe(true);
        expect(pull?.state).toBe('closed');
        expect(branch).toBeUndefined();
        expect(probe.phases).toEqual(['creating', 'reading', 'deleting']);
        expect(calls).toContain('POST /repos/owner/repo/pulls');
        expect(await readdir(folder)).toEqual([]);
    });

    it('deletes only its temporary branch when GitHub rejects draft PR creation', async () => {
        const root = '/repos/owner/repo';
        let branch: string | undefined;
        const calls: string[] = [];
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            calls.push(`${method} ${path}`);
            if (path === root) return reply(200, { default_branch: 'main' });
            if (path === `${root}/git/ref/heads/main`) return reply(200, { object: { sha: 'a'.repeat(40) } });
            if (path.startsWith(`${root}/git/ref/heads/copilot-permission-test-`)) return branch ? reply(200) : reply(404);
            if (path === `${root}/git/refs` && method === 'POST') {
                branch = (JSON.parse(String(options?.body)) as { ref: string }).ref.slice('refs/heads/'.length);
                return reply(201);
            }
            if (path.startsWith(`${root}/contents/.copilot-permission-test/`) && method === 'PUT') return reply(201);
            if (path === `${root}/pulls` && method === 'POST') return reply(403);
            if (path.startsWith(`${root}/git/refs/heads/copilot-permission-test-`) && method === 'DELETE') {
                branch = undefined; return reply(204);
            }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('pull-requests', 'repository', fetcher);
        await expect(probeDisposableResource(probe.value)).rejects.toThrow('HTTP 403');
        expect(branch).toBeUndefined();
        expect(calls.some(call => call === `GET ${root}/pulls`)).toBe(false);
        expect(await readdir(folder)).toEqual([]);
    });

    it.each([
        { trusted: false, preceding: 0, advanceDefault: false },
        { trusted: true, preceding: 0, advanceDefault: false },
        { trusted: true, preceding: 0, advanceDefault: true },
        { trusted: false, preceding: 9, advanceDefault: false },
        { trusted: false, preceding: 100, advanceDefault: false },
    ])('dispatches and deletes a no-job Actions run after $preceding preceding workflows (trusted: $trusted, advancing default: $advanceDefault)',
        async ({ trusted, preceding, advanceDefault }) => {
        const root = '/repos/owner/repo';
        const sha = 'a'.repeat(40);
        const laterSha = 'c'.repeat(40);
        const blobSha = 'b'.repeat(40);
        const workflowPath = trusted ? '.github/workflows/copilot_credential_health.yml' : '.github/workflows/health.yml';
        const defaultContent = trusted
            ? await committedHealthWorkflow()
            : 'on: [workflow_dispatch]\n';
        let branch: string | undefined;
        let content: string | undefined;
        let run = false;
        let dispatched = false;
        let mutableWorkflowRead = false;
        let mutableDefaultSha = sha;
        const listedPages: number[] = [];
        const workflows = [
            ...Array.from({ length: preceding }, (_, index) => ({
                id: index + 1, path: `.github/workflows/inactive-${index}.yml`, state: 'disabled_manually',
            })),
            { id: 123, path: workflowPath, state: 'active' },
        ];
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const parsed = new URL(url);
            const path = parsed.pathname;
            const method = options?.method ?? 'GET';
            if (path === root) return reply(200, { default_branch: 'main' });
            if (path === `${root}/actions/workflows` && method === 'GET') {
                const page = Number(parsed.searchParams.get('page'));
                listedPages.push(page);
                return reply(200, { workflows: workflows.slice((page - 1) * 100, page * 100) });
            }
            if (path === `${root}/contents/${workflowPath}` && method === 'GET') {
                const sourceRef = parsed.searchParams.get('ref');
                if (sourceRef === 'main') {
                    mutableWorkflowRead = true;
                    const contentAtRead = mutableDefaultSha === sha ? defaultContent : 'on: workflow_dispatch\njobs:\n  unsafe:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n';
                    if (advanceDefault) mutableDefaultSha = laterSha;
                    return reply(200, { path: workflowPath, encoding: 'base64', sha: blobSha,
                        content: Buffer.from(contentAtRead).toString('base64') });
                }
                if (sourceRef === sha) return reply(200, { path: workflowPath, encoding: 'base64', sha: blobSha,
                    content: Buffer.from(defaultContent).toString('base64') });
                if (sourceRef === laterSha) return reply(200, { path: workflowPath, encoding: 'base64', sha: blobSha,
                    content: Buffer.from('on: workflow_dispatch\njobs:\n  unsafe:\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n').toString('base64') });
                return reply(200, { path: workflowPath, encoding: 'base64', content });
            }
            if (path === `${root}/git/ref/heads/main`) {
                const current = mutableDefaultSha;
                if (advanceDefault) mutableDefaultSha = laterSha;
                return reply(200, { object: { sha: current } });
            }
            if (path.startsWith(`${root}/git/ref/heads/copilot-permission-test-`) && method === 'GET') {
                return branch ? reply(200, { ref: `refs/heads/${branch}` }) : reply(404);
            }
            if (path === `${root}/git/refs` && method === 'POST') {
                const body = JSON.parse(String(options?.body)) as { ref: string; sha: string };
                expect(body.sha).toBe(sha);
                branch = body.ref.slice('refs/heads/'.length);
                return reply(201);
            }
            if (path === `${root}/contents/${workflowPath}` && method === 'PUT') {
                const body = JSON.parse(String(options?.body)) as { sha: string; branch: string; content: string };
                expect(body.sha).toBe(blobSha);
                expect(body.branch).toBe(branch);
                content = body.content;
                return reply(200);
            }
            if (path === `${root}/actions/workflows/123/dispatches` && method === 'POST') {
                expect(JSON.parse(String(options?.body))).toEqual({ ref: branch, return_run_details: true });
                dispatched = true;
                run = true;
                return reply(200, { workflow_run_id: 77 });
            }
            if (path === `${root}/actions/runs/77` && method === 'GET') return run
                ? reply(200, { id: 77, head_branch: branch, event: 'workflow_dispatch', workflow_id: 123, status: 'completed' })
                : reply(404);
            if (path === `${root}/actions/runs/77` && method === 'DELETE') { run = false; return reply(204); }
            if (path.startsWith(`${root}/git/refs/heads/copilot-permission-test-`) && method === 'DELETE') {
                branch = undefined; return reply(204);
            }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('actions', 'repository', fetcher);
        await probeDisposableResource(probe.value);
        expect(dispatched).toBe(true);
        if (advanceDefault) expect(mutableWorkflowRead).toBe(false);
        expect(Boolean(content)).toBe(!trusted);
        expect(run).toBe(false);
        expect(branch).toBeUndefined();
        expect(listedPages).toEqual(preceding === 100 ? [1, 2] : [1]);
        expect(probe.phases).toEqual(['creating', 'reading', 'deleting']);
        expect(await readdir(folder)).toEqual([]);
    });

    it.each([
        { count: 65, state: 'active', failure: 'could not inspect every candidate' },
        { count: 500, state: 'disabled_manually', failure: 'could not inspect every index page' },
    ])('reports an incomplete Actions search after $count candidates without mutating', async ({ count, state, failure }) => {
        const root = '/repos/owner/repo';
        const calls: string[] = [];
        const workflows = Array.from({ length: count }, (_, index) => ({
            id: index + 1, path: `.github/workflows/check-${index}.yml`, state,
        }));
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const parsed = new URL(url);
            const path = parsed.pathname;
            const method = options?.method ?? 'GET';
            calls.push(`${method} ${path}`);
            if (path === root && method === 'GET') return reply(200, { default_branch: 'main' });
            if (path === `${root}/git/ref/heads/main` && method === 'GET') return reply(200, {
                object: { sha: 'a'.repeat(40) },
            });
            if (path === `${root}/actions/workflows` && method === 'GET') {
                const page = Number(parsed.searchParams.get('page'));
                return reply(200, { workflows: workflows.slice((page - 1) * 100, page * 100) });
            }
            if (path.startsWith(`${root}/contents/.github/workflows/`) && method === 'GET') {
                return reply(200, { encoding: 'base64', sha: 'a'.repeat(40),
                    content: Buffer.from('on: push\n').toString('base64') });
            }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('actions', 'repository', fetcher);
        await expect(probeDisposableResource(probe.value)).rejects.toThrow(failure);
        expect(calls.every(call => call.startsWith('GET '))).toBe(true);
        expect(await readdir(folder)).toEqual([]);
    });

    it('removes its branch when GitHub rejects an Actions dispatch without creating a run', async () => {
        const root = '/repos/owner/repo';
        const workflowPath = '.github/workflows/copilot_credential_health.yml';
        const template = await committedHealthWorkflow();
        let branch: string | undefined;
        const methods: string[] = [];
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const parsed = new URL(url);
            const path = parsed.pathname;
            const method = options?.method ?? 'GET';
            methods.push(`${method} ${path}`);
            if (path === root) return reply(200, { default_branch: 'main' });
            if (path === `${root}/actions/workflows`) return reply(200, { workflows: [{ id: 123, path: workflowPath, state: 'active' }] });
            if (path === `${root}/contents/${workflowPath}`) return reply(200, { path: workflowPath, encoding: 'base64',
                sha: 'b'.repeat(40), content: Buffer.from(template).toString('base64') });
            if (path === `${root}/git/ref/heads/main`) return reply(200, { object: { sha: 'a'.repeat(40) } });
            if (path.startsWith(`${root}/git/ref/heads/copilot-permission-test-`)) return branch ? reply(200) : reply(404);
            if (path === `${root}/git/refs` && method === 'POST') {
                branch = (JSON.parse(String(options?.body)) as { ref: string }).ref.slice('refs/heads/'.length);
                return reply(201);
            }
            if (path === `${root}/actions/workflows/123/dispatches` && method === 'POST') {
                expect(JSON.parse(String(options?.body))).toEqual({ ref: branch, return_run_details: true });
                return reply(403);
            }
            if (path.startsWith(`${root}/git/refs/heads/copilot-permission-test-`) && method === 'DELETE') {
                branch = undefined; return reply(204);
            }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('actions', 'repository', fetcher);
        await expect(probeDisposableResource(probe.value)).rejects.toThrow('HTTP 403');
        expect(branch).toBeUndefined();
        expect(methods.some(call => call.includes('/actions/runs'))).toBe(false);
        expect(await readdir(folder)).toEqual([]);
    });

    it('names Contents Write when branch creation is denied before the Actions dispatch', async () => {
        const root = '/repos/owner/repo';
        const workflowPath = '.github/workflows/copilot_credential_health.yml';
        const methods: string[] = [];
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            methods.push(`${method} ${path}`);
            if (path === root) return reply(200, { default_branch: 'main' });
            if (path === `${root}/actions/workflows`) return reply(200, {
                workflows: [{ id: 123, path: workflowPath, state: 'active' }],
            });
            if (path === `${root}/contents/${workflowPath}`) return reply(200, {
                path: workflowPath, encoding: 'base64', sha: 'b'.repeat(40),
                content: Buffer.from(await committedHealthWorkflow()).toString('base64'),
            });
            if (path === `${root}/git/ref/heads/main`) return reply(200, { object: { sha: 'a'.repeat(40) } });
            if (path.startsWith(`${root}/git/ref/heads/copilot-permission-test-`)) return reply(404);
            if (path === `${root}/git/refs` && method === 'POST') return reply(403);
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('actions', 'repository', fetcher);
        await expect(probeDisposableResource(probe.value)).rejects.toThrow('confirm repository Contents Write');
        expect(methods.some(call => call.includes('/dispatches'))).toBe(false);
        expect(await readdir(folder)).toEqual([]);
    });

    it('verifies a 204 Actions dispatch only after a unique exact run readback and cleanup', async () => {
        const root = '/repos/owner/repo';
        const workflowPath = '.github/workflows/copilot_credential_health.yml';
        const template = await committedHealthWorkflow();
        let branch: string | undefined;
        let run = false;
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const parsed = new URL(url);
            const path = parsed.pathname;
            const method = options?.method ?? 'GET';
            if (path === root) return reply(200, { default_branch: 'main' });
            if (path === `${root}/actions/workflows`) return reply(200, {
                workflows: [{ id: 123, path: workflowPath, state: 'active' }],
            });
            if (path === `${root}/contents/${workflowPath}`) return reply(200, { path: workflowPath,
                encoding: 'base64', sha: 'b'.repeat(40), content: Buffer.from(template).toString('base64') });
            if (path === `${root}/git/ref/heads/main`) return reply(200, { object: { sha: 'a'.repeat(40) } });
            if (path.startsWith(`${root}/git/ref/heads/copilot-permission-test-`)) return branch ? reply(200) : reply(404);
            if (path === `${root}/git/refs` && method === 'POST') {
                branch = (JSON.parse(String(options?.body)) as { ref: string }).ref.slice('refs/heads/'.length);
                return reply(201);
            }
            if (path === `${root}/actions/workflows/123/dispatches` && method === 'POST') {
                expect(JSON.parse(String(options?.body))).toEqual({ ref: branch, return_run_details: true });
                run = true;
                return reply(204);
            }
            if (path === `${root}/actions/runs` && method === 'GET') return reply(200, {
                workflow_runs: run ? [{ id: 77, head_branch: branch, event: 'workflow_dispatch', workflow_id: 123 }] : [],
            });
            if (path === `${root}/actions/runs/77` && method === 'GET') return run
                ? reply(200, { id: 77, head_branch: branch, event: 'workflow_dispatch', workflow_id: 123, status: 'completed' })
                : reply(404);
            if (path === `${root}/actions/runs/77` && method === 'DELETE') { run = false; return reply(204); }
            if (path.startsWith(`${root}/git/refs/heads/copilot-permission-test-`) && method === 'DELETE') {
                branch = undefined; return reply(204);
            }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('actions', 'repository', fetcher);
        await probeDisposableResource(probe.value);
        expect(probe.phases).toEqual(['creating', 'reading', 'deleting']);
        expect(run).toBe(false);
        expect(branch).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
    });

    it.each(['repository', 'organization'] as const)('uses encrypted data and verifies exact %s Secret metadata before cleanup', async scope => {
        let name: string | undefined;
        const root = scope === 'organization' ? '/orgs/owner/actions/secrets' : '/repos/owner/repo/actions/secrets';
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            if (path === '/repos/owner/repo' && method === 'GET') return reply(200, { id: 123 });
            if (path === `${root}/public-key`) return reply(200, { key: Buffer.alloc(32, 1).toString('base64'), key_id: 'fixture-key' });
            if (path.startsWith(`${root}/`) && method === 'PUT') {
                expect(path.slice(root.length + 1)).toMatch(/^COPILOT_PERMISSION_TEST_[A-F0-9]{64}$/u);
                const body = JSON.parse(String(options?.body)) as { encrypted_value: string; key_id: string; visibility?: string; selected_repository_ids?: number[] };
                expect(body.key_id).toBe('fixture-key');
                expect(Buffer.from(body.encrypted_value, 'base64').length).toBeGreaterThan(48);
                if (scope === 'organization') {
                    expect(body.visibility).toBe('selected');
                    expect(body.selected_repository_ids).toEqual([123]);
                }
                name = path.slice(root.length + 1);
                return reply(201);
            }
            if (path.startsWith(`${root}/`) && method === 'GET') return name ? reply(200, { name }) : reply(404);
            if (path.startsWith(`${root}/`) && method === 'DELETE') { name = undefined; return reply(204); }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('secrets', scope, fetcher);
        await probeDisposableResource(probe.value);
        expect(probe.phases).toEqual(['creating', 'reading', 'deleting']);
        expect(name).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
    });

    it('never deletes a Secret when GitHub reports an existing value at the generated name', async () => {
        const methods: string[] = [];
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const method = options?.method ?? 'GET';
            methods.push(method);
            if (url.endsWith('/public-key')) return reply(200, { key: Buffer.alloc(32, 1).toString('base64'), key_id: 'fixture-key' });
            if (method === 'GET') return reply(404);
            if (method === 'PUT') return reply(204);
            throw new Error('Unexpected fixture request');
        }) as unknown as typeof fetch;
        const probe = context('secrets', 'repository', fetcher);
        let failure: unknown;
        try { await probeDisposableResource(probe.value); } catch (error) { failure = error; }
        expect(failure).toMatchObject({
            message: expect.stringContaining('existing Secret'), httpStatus: 204, cleanupPending: true,
        });
        expect(writeProbeFailure({ id: 'test', role: 'setup', scope: 'repository', permission: 'Secrets',
            level: 'write', applicability: 'required', reason: 'fixture', probe: 'secrets' }, failure))
            .toMatchObject({ status: 'unverifiable', cleanupPending: true, incident: 'secret-collision' });
        expect(methods).toContain('PUT');
        expect(methods).not.toContain('DELETE');
        expect(await readdir(folder)).toEqual([]);
    });

    it('cleans up a temporary label after a readback error', async () => {
        let name: string | undefined;
        let reads = 0;
        const root = '/repos/owner/repo/labels';
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            if (path === root && method === 'POST') {
                name = (JSON.parse(String(options?.body)) as { name: string }).name;
                expect(name.length).toBeLessThanOrEqual(100);
                return reply(201);
            }
            if (path.startsWith(`${root}/`) && method === 'GET') {
                reads += 1;
                return name ? reply(200, { name: reads === 2 ? 'wrong' : name }) : reply(404);
            }
            if (path.startsWith(`${root}/`) && method === 'DELETE') { name = undefined; return reply(204); }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('issues', 'repository', fetcher);
        await expect(probeDisposableResource(probe.value)).rejects.toThrow('readback did not match');
        expect(name).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
    });

    it('creates, reads and deletes an exact temporary repository label', async () => {
        let name: string | undefined;
        const root = '/repos/owner/repo/labels';
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            if (path === root && method === 'POST') {
                name = (JSON.parse(String(options?.body)) as { name: string }).name;
                expect(name.length).toBeLessThanOrEqual(100);
                return reply(201);
            }
            if (path.startsWith(`${root}/`) && method === 'GET') return name ? reply(200, { name }) : reply(404);
            if (path.startsWith(`${root}/`) && method === 'DELETE') { name = undefined; return reply(204); }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('issues', 'repository', fetcher);
        await probeDisposableResource(probe.value);
        expect(probe.phases).toEqual(['creating', 'reading', 'deleting']);
        expect(name).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
    });

    it('creates a disabled Issue Type and deletes only the returned ID', async () => {
        let issueType: { id: number; name: string } | undefined;
        const root = '/orgs/owner/issue-types';
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            if (path === root && method === 'POST') {
                const body = JSON.parse(String(options?.body)) as { name: string; is_enabled: boolean };
                expect(body.is_enabled).toBe(false);
                issueType = { id: 1234, name: body.name };
                return reply(200, issueType);
            }
            if (path === root && method === 'GET') return reply(200, issueType ? [issueType] : []);
            if (path === `${root}/1234` && method === 'DELETE') { issueType = undefined; return reply(204); }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('issue-types', 'organization', fetcher);
        await probeDisposableResource(probe.value);
        expect(probe.phases).toEqual(['creating', 'reading', 'deleting']);
        expect(issueType).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
    });

    it('recovers a journaled Variable after a simulated process interruption', async () => {
        const name = `COPILOT_PERMISSION_TEST_${'A'.repeat(32)}`;
        let exists = true;
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            if (path === `/repos/owner/repo/actions/variables/${name}` && options?.method === 'DELETE') {
                exists = false; return reply(204);
            }
            if (path === `/repos/owner/repo/actions/variables/${name}`) return exists ? reply(200, { name }) : reply(404);
            throw new Error('Unexpected fixture request');
        }) as unknown as typeof fetch;
        const probe = context('variables', 'repository', fetcher);
        await probe.journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'variables', name });
        await probe.journal.recover('owner', 'repo', probe.value.http);
        expect(exists).toBe(false);
        expect(await readdir(folder)).toEqual([]);
    });

    it('keeps a private, token-free journal when cleanup cannot be confirmed', async () => {
        let name: string | undefined;
        const root = '/repos/owner/repo/actions/variables';
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            if (path === root && method === 'POST') {
                name = (JSON.parse(String(options?.body)) as { name: string }).name;
                return reply(201);
            }
            if (path.startsWith(`${root}/`) && method === 'GET') return name
                ? reply(200, { name, value: 'mismatch' }) : reply(404);
            if (path.startsWith(`${root}/`) && method === 'DELETE') return reply(500);
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('variables', 'repository', fetcher);
        await expect(probeDisposableResource(probe.value)).rejects.toThrow('cleanup could not be confirmed');
        const names = await readdir(folder);
        expect(names).toHaveLength(1);
        const journalText = await readFile(join(folder, names[0]), 'utf8');
        expect(journalText).toContain(name);
        expect(journalText).not.toContain('fixture-token');
        expect(journalText).not.toContain('mismatch');
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher, journal: probe.journal }).inspect(
            'owner', 'repo', 'fixture-token', [{ id: 'setup.repository.variables', role: 'setup',
                scope: 'repository', permission: 'Variables', level: 'write', applicability: 'required',
                reason: 'test', probe: 'variables' }]);
        expect(check).toMatchObject({ status: 'unverifiable', cleanupPending: true });
    });

    it('recovers an ambiguous Variable create response by reading and deleting only its generated name', async () => {
        let variable: { name: string; value: string } | undefined;
        const root = '/repos/owner/repo/actions/variables';
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            if (path === root && method === 'POST') {
                variable = JSON.parse(String(options?.body)) as { name: string; value: string };
                throw new Error('simulated lost response');
            }
            if (path.startsWith(`${root}/`) && method === 'GET') return variable ? reply(200, variable) : reply(404);
            if (path.startsWith(`${root}/`) && method === 'DELETE') { variable = undefined; return reply(204); }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('variables', 'repository', fetcher);
        await expect(probeDisposableResource(probe.value)).rejects.toThrow('GitHub POST did not complete');
        expect(variable).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
    });

    it('rejects forged scope and target names before journaling or remote calls', async () => {
        const journal = new SetupPermissionProbeJournal(folder);
        await expect(journal.begin({ owner: 'owner', repository: 'repo', scope: 'organization',
            probe: 'pull-requests', name: `copilot-permission-test-${'a'.repeat(32)}` })).rejects.toThrow('unsafe target');
        await expect(journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository',
            probe: 'variables', name: 'EXISTING_PRODUCTION_VALUE' })).rejects.toThrow('unsafe target');
        expect(await readdir(folder)).toEqual([]);
    });

    it('recovers an interrupted draft PR by closing its exact head and removing its branch', async () => {
        const name = `copilot-permission-test-${'a'.repeat(32)}`;
        const title = `Copilot permission test ${'a'.repeat(32)}`;
        let state = 'open';
        let branch = true;
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            const root = '/repos/owner/repo';
            if (path === `${root}/pulls` && method === 'GET') return reply(200, [{
                number: 42, title, state, merged_at: null, head: { ref: name },
            }]);
            if (path === `${root}/pulls/42` && method === 'PATCH') { state = 'closed'; return reply(200); }
            if (path === `${root}/pulls/42` && method === 'GET') return reply(200, { number: 42, title, state });
            if (path === `${root}/git/ref/heads/${name}` && method === 'GET') return branch ? reply(200) : reply(404);
            if (path === `${root}/git/refs/heads/${name}` && method === 'DELETE') { branch = false; return reply(204); }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('pull-requests', 'repository', fetcher);
        const handle = await probe.journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'pull-requests', name });
        await handle.markPullAttempted();
        await probe.journal.recover('owner', 'repo', probe.value.http);
        expect(state).toBe('closed');
        expect(branch).toBe(false);
        expect(await readdir(folder)).toEqual([]);
    });

    it('recovers an accepted Actions run by cancelling, deleting and removing its branch', async () => {
        const name = `copilot-permission-test-${'b'.repeat(32)}`;
        let run = true;
        let cancelled = false;
        let branch = true;
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const path = new URL(url).pathname;
            const method = options?.method ?? 'GET';
            const root = '/repos/owner/repo';
            if (path === `${root}/actions/runs/77` && method === 'GET') return run
                ? reply(200, { id: 77, head_branch: name, event: 'workflow_dispatch', status: cancelled ? 'completed' : 'queued' })
                : reply(404);
            if (path === `${root}/actions/runs/77/cancel` && method === 'POST') { cancelled = true; return reply(202); }
            if (path === `${root}/actions/runs/77` && method === 'DELETE') { run = false; return reply(204); }
            if (path === `${root}/git/ref/heads/${name}` && method === 'GET') return branch ? reply(200) : reply(404);
            if (path === `${root}/git/refs/heads/${name}` && method === 'DELETE') { branch = false; return reply(204); }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context('actions', 'repository', fetcher);
        const handle = await probe.journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'actions', name });
        await handle.markDispatchAttempted();
        await handle.setRunId(77);
        await probe.journal.recover('owner', 'repo', probe.value.http);
        expect(cancelled).toBe(true);
        expect(run).toBe(false);
        expect(branch).toBe(false);
        expect(await readdir(folder)).toEqual([]);
    });

    it.each(['contents', 'workflows'] as const)('proves %s Write on a disposable ref and removes it', async kind => {
        const root = '/repos/owner/repo';
        let branch: string | undefined;
        let filePath: string | undefined;
        const calls: string[] = [];
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            const parsed = new URL(url);
            const path = parsed.pathname;
            const method = options?.method ?? 'GET';
            calls.push(`${method} ${path}`);
            if (path === root && method === 'GET') return reply(200, { default_branch: 'main' });
            if (path === `${root}/git/ref/heads/main` && method === 'GET') return reply(200, { object: { sha: 'a'.repeat(40) } });
            if (path.startsWith(`${root}/git/ref/heads/copilot-permission-test-`) && method === 'GET') {
                return branch ? reply(200, { ref: `refs/heads/${branch}` }) : reply(404);
            }
            if (path === `${root}/git/refs` && method === 'POST') {
                branch = (JSON.parse(String(options?.body)) as { ref: string }).ref.replace('refs/heads/', '');
                return reply(201);
            }
            if (path.startsWith(`${root}/git/refs/heads/`) && method === 'DELETE') { branch = undefined; return reply(204); }
            if (path.startsWith(`${root}/contents/.github/workflows/`) && method === 'PUT') {
                const body = JSON.parse(String(options?.body)) as { branch: string; content: string };
                expect(body.branch).toBe(branch);
                expect(Buffer.from(body.content, 'base64').toString('utf8')).toContain('if: false');
                filePath = path.slice(`${root}/contents/`.length);
                return reply(201);
            }
            if (path.startsWith(`${root}/contents/.github/workflows/`) && method === 'GET') {
                expect(parsed.searchParams.get('ref')).toBe(branch);
                return reply(200, { path: filePath, type: 'file' });
            }
            throw new Error(`Unexpected fixture request ${method} ${path}`);
        }) as unknown as typeof fetch;
        const probe = context(kind, 'repository', fetcher);
        await probeDisposableResource(probe.value);
        expect(branch).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
        if (kind === 'workflows') expect(calls).toContainEqual(expect.stringMatching(/^PUT \/repos\/owner\/repo\/contents\/\.github\/workflows\//u));
        else expect(calls.some(call => call.startsWith('PUT '))).toBe(false);
    });

    it('creates, reads and removes an organization Project without touching existing items', async () => {
        let project: { id: string; title: string } | undefined;
        const fetcher = jest.fn(async (url: string, options?: RequestOptions) => {
            if (url === 'https://api.github.com/orgs/owner') return reply(200, { node_id: 'O_12345678' });
            if (url !== 'https://api.github.com/graphql') throw new Error('Unexpected fixture URL');
            const body = JSON.parse(String(options?.body)) as { query: string; variables: Record<string, string> };
            if (body.query.includes('createProjectV2')) {
                project = { id: 'PVT_12345678', title: body.variables.title };
                return reply(200, { data: { createProjectV2: { projectV2: project } } });
            }
            if (body.query.includes('deleteProjectV2')) {
                const removed = project;
                project = undefined;
                return reply(200, { data: { deleteProjectV2: { projectV2: removed } } });
            }
            if (body.query.includes('node(id:')) return reply(200, { data: { node: project ?? null } });
            throw new Error('Unexpected fixture GraphQL query');
        }) as unknown as typeof fetch;
        const probe = context('projects', 'organization', fetcher);
        await probeDisposableResource(probe.value);
        expect(probe.phases).toEqual(['creating', 'reading', 'deleting']);
        expect(project).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
    });

    it('finds a journaled Project by filtered unique title beyond 500 unrelated Projects after a crash', async () => {
        const title = 'Copilot permission test ' + 'a'.repeat(32);
        let project: { id: string; title: string } | undefined = { id: 'PVT_12345678', title };
        const unrelated = Array.from({ length: 600 }, (_, index) => ({
            id: `PVT_${String(index).padStart(8, '0')}`, title: `Other project ${index}`,
        }));
        const fetcher = jest.fn(async (_url: string, options?: RequestOptions) => {
            const body = JSON.parse(String(options?.body)) as { query: string; variables: { title?: string; after?: string | null } };
            if (body.query.includes('projectsV2(first:')) {
                const filtered = body.query.includes('query:$title') && body.variables.title === title;
                const page = Number(body.variables.after ?? '0');
                const nodes = filtered ? (project ? [project] : []) : unrelated.slice(page * 100, (page + 1) * 100);
                return reply(200, { data: { organization: { projectsV2: {
                    nodes, pageInfo: { hasNextPage: !filtered && page < 5, endCursor: !filtered ? String(page + 1) : null },
                } } } });
            }
            if (body.query.includes('deleteProjectV2')) {
                const removed = project;
                project = undefined;
                return reply(200, { data: { deleteProjectV2: { projectV2: removed } } });
            }
            if (body.query.includes('node(id:')) return reply(200, { data: { node: project ?? null } });
            throw new Error('Unexpected fixture GraphQL query');
        }) as unknown as typeof fetch;
        const probe = context('projects', 'organization', fetcher);
        await probe.journal.begin({ owner: 'owner', repository: 'repo', scope: 'organization', probe: 'projects', name: title });
        await probe.journal.recover('owner', 'repo', probe.value.http);
        expect(project).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
    });
});
