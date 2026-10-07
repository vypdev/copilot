import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import { SetupPermissionProbeHttp } from '../setup_permission_probe_http';
import { SetupPermissionProbeJournal } from '../setup_permission_probe_journal';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

const root = '/repos/owner/repo';
const path = '.github/workflows/registered.yml';
const sha = 'a'.repeat(40);
const changedSha = 'b'.repeat(40);
const actions: SetupTokenPermissionRequirement = { id: 'workflow.repository.actions', role: 'workflow', scope: 'repository',
    permission: 'Actions', probe: 'actions', level: 'write', applicability: 'required', reason: 'Dispatch enabled routes.' };
const reply = (status: number, body?: unknown) => new Response(status === 204 || status === 404 ? null : JSON.stringify(body), { status });

describe('setup preparation of a bot Actions permission check', () => {
    let folder: string;
    beforeEach(async () => { folder = await mkdtemp(join(tmpdir(), 'copilot-operator-actions-')); });
    afterEach(async () => { await rm(folder, { recursive: true, force: true }); });

    function fixture(denial?: 'dispatch' | 'preparation' | 'cleanup' | 'readback', completionDelayMs = 0) {
        let branch: string | undefined;
        let content: string | undefined;
        let runExists = false;
        let candidateReadPending = false;
        let dispatchedAt = 0;
        let notifyCancellation: () => void;
        const cancellationStarted = new Promise<void>(resolve => { notifyCancellation = resolve; });
        const calls: { method: string; path: string; token: string }[] = [];
        const fetcher = jest.fn(async (url: string | URL | Request, options?: RequestInit) => {
            const parsed = new URL(String(url));
            const method = options?.method ?? 'GET';
            const token = new Headers(options?.headers).get('authorization') ?? '';
            calls.push({ method, path: parsed.pathname, token });
            const isCandidate = token === 'Bearer bot-fixture';
            // Only the candidate can prove dispatch and its first exact run read.
            const candidateOperation = parsed.pathname.endsWith('/dispatches')
                || (parsed.pathname.endsWith('/actions/runs/7') && method === 'GET' && candidateReadPending);
            if (candidateOperation) expect(isCandidate).toBe(true);
            else expect(token).toBe('Bearer operator-fixture');
            if (parsed.pathname === root) return reply(200, { default_branch: 'main' });
            if (parsed.pathname === `${root}/git/ref/heads/main`) return reply(200, { object: { sha } });
            if (parsed.pathname === `${root}/actions/workflows`) return reply(200, { total_count: 1,
                workflows: [{ id: 123, path, state: 'active' }] });
            if (parsed.pathname === `${root}/contents/${path}` && method === 'GET') {
                return reply(200, { path, encoding: 'base64', sha,
                    content: content ?? Buffer.from('on: workflow_dispatch\njobs:\n  real:\n    runs-on: ubuntu-latest\n').toString('base64') });
            }
            if (parsed.pathname === `${root}/git/refs` && method === 'POST') {
                branch = JSON.parse(String(options?.body)).ref.slice('refs/heads/'.length);
                return reply(201);
            }
            if (parsed.pathname.startsWith(`${root}/git/ref/heads/copilot-permission-test-`)) {
                return branch ? reply(200, { ref: `refs/heads/${branch}`, object: { sha: content ? changedSha : sha } }) : reply(404);
            }
            if (parsed.pathname === `${root}/contents/${path}` && method === 'PUT') {
                if (denial === 'preparation') return reply(403, { message: 'Resource not accessible by personal access token' });
                const written = JSON.parse(String(options?.body));
                expect(written.branch).toBe(branch);
                expect(Buffer.from(written.content, 'base64').toString('utf8')).toContain('if: ${{ false }}');
                content = written.content;
                return reply(200, { commit: { sha: changedSha } });
            }
            if (parsed.pathname.endsWith('/dispatches')) {
                expect(content).toBeDefined();
                expect(JSON.parse(String(options?.body)).ref).toBe(branch);
                if (denial === 'dispatch') return reply(403, { message: 'Resource not accessible by personal access token' });
                runExists = true;
                candidateReadPending = true;
                dispatchedAt = Date.now();
                return reply(200, { workflow_run_id: 7 });
            }
            if (parsed.pathname.endsWith('/actions/runs/7/cancel')) { notifyCancellation(); return reply(202); }
            if (parsed.pathname.endsWith('/actions/runs/7')) {
                if (method === 'DELETE') { runExists = false; return reply(204); }
                candidateReadPending = false;
                if (denial === 'readback' && isCandidate) return reply(403);
                return runExists ? reply(200, { id: 7, workflow_id: 123, head_branch: branch,
                    event: 'workflow_dispatch', status: Date.now() - dispatchedAt >= completionDelayMs ? 'completed' : 'queued' }) : reply(404);
            }
            if (parsed.pathname.startsWith(`${root}/git/refs/heads/copilot-permission-test-`) && method === 'DELETE') {
                if (denial === 'cleanup') return reply(403);
                branch = undefined; return reply(204);
            }
            throw new Error(`Unexpected fixture request ${method} ${parsed.pathname}`);
        });
        return { fetcher, calls, hasBranch: () => branch !== undefined,
            completeNow: () => { completionDelayMs = 0; }, cancellationStarted };
    }

    async function inspect(value: ReturnType<typeof fixture>) {
        return new SetupTokenPermissionQueryAdapter({ fetcher: value.fetcher, journal: new SetupPermissionProbeJournal(folder) })
            .inspect('owner', 'repo', 'bot-fixture', [actions], undefined, undefined, false, 'operator-fixture');
    }

    it('verifies bot Actions Write without giving it Workflows Write or allowing operator dispatch', async () => {
        const value = fixture();
        expect(await inspect(value)).toEqual([expect.objectContaining({ status: 'verified', writeProof: 'transaction' })]);
        expect(value.calls.filter(call => call.token === 'Bearer bot-fixture').map(call => call.method))
            .toEqual(['POST', 'GET']);
        expect(value.hasBranch()).toBe(false);
        expect(await readdir(folder)).toEqual([]);
    });
    it.each(['dispatch', 'readback'] as const)('never substitutes setup authority when bot %s is denied', async denial => {
        const value = fixture(denial);
        const [check] = await inspect(value);
        expect(check.status).not.toBe('verified');
        expect(check.writeProof).toBeUndefined();
        expect(value.calls.filter(call => call.path.endsWith('/dispatches'))).toHaveLength(1);
        expect(value.hasBranch()).toBe(false);
        expect(await readdir(folder)).toEqual([]);
    });
    it('reports a setup preparation prerequisite without dispatching or marking bot Actions missing', async () => {
        const value = fixture('preparation');
        expect(await inspect(value)).toEqual([expect.objectContaining({ status: 'unverifiable', prerequisite: 'contents-workflows-write' })]);
        expect(value.calls.some(call => call.path.endsWith('/dispatches'))).toBe(false);
        expect(await readdir(folder)).toEqual([]);
    });
    it('blocks verified evidence and retains a credential-free recovery record when operator cleanup is denied', async () => {
        const value = fixture('cleanup');
        expect(await inspect(value)).toEqual([expect.objectContaining({ status: 'unverifiable', cleanupPending: true })]);
        const records = await readdir(folder);
        expect(records).toHaveLength(1);
        const journal = await readFile(join(folder, records[0]), 'utf8');
        expect(journal).not.toContain('bot-fixture');
        expect(journal).not.toContain('operator-fixture');
    });
    it('keeps a delayed no-job bot audit pending until operator cleanup confirms both run and branch removal', async () => {
        jest.useFakeTimers();
        try {
            const value = fixture(undefined, 11000);
            const result = inspect(value);
            await Promise.race([value.cancellationStarted, result]);
            expect(value.calls.some(call => call.path.endsWith('/cancel'))).toBe(true);
            expect(value.hasBranch()).toBe(true);
            expect(await readdir(folder)).toHaveLength(1);
            await jest.advanceTimersByTimeAsync(15000);
            expect(await result).toEqual([expect.objectContaining({ status: 'verified', writeProof: 'transaction' })]);
            expect(value.calls.filter(call => call.token === 'Bearer bot-fixture').map(call => call.method)).toEqual(['POST', 'GET']);
            expect(value.hasBranch()).toBe(false);
            expect(await readdir(folder)).toEqual([]);
        } finally { jest.useRealTimers(); }
    });
    it('retains an overdue Actions journal and recovers it before starting another candidate dispatch', async () => {
        jest.useFakeTimers();
        try {
            const value = fixture(undefined, Infinity);
            const result = inspect(value);
            await Promise.race([value.cancellationStarted, result]);
            expect(value.calls.some(call => call.path.endsWith('/cancel'))).toBe(true);
            await jest.advanceTimersByTimeAsync(60000);
            expect(await result).toEqual([expect.objectContaining({ status: 'unverifiable', cleanupPending: true })]);
            expect(value.hasBranch()).toBe(true);
            expect(await readdir(folder)).toHaveLength(1);
            const startRecovery = value.calls.length;
            value.completeNow();
            expect(await inspect(value)).toEqual([expect.objectContaining({ status: 'verified', writeProof: 'transaction' })]);
            const recovery = value.calls.slice(startRecovery);
            const nextDispatch = recovery.findIndex(call => call.path.endsWith('/dispatches'));
            expect(recovery.slice(0, nextDispatch).filter(call => call.method === 'DELETE').map(call => call.path))
                .toEqual([`${root}/actions/runs/7`, expect.stringContaining(`${root}/git/refs/heads/copilot-permission-test-`)]);
            expect(value.hasBranch()).toBe(false);
            expect(await readdir(folder)).toEqual([]);
        } finally { jest.useRealTimers(); }
    });
    it('uses setup authority only for pending Actions recovery, preserving candidate authority for Projects', async () => {
        const journal = new SetupPermissionProbeJournal(folder);
        const action = await journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'actions',
            name: `copilot-permission-test-${'c'.repeat(32)}` });
        await action.setReferenceSha(sha);
        await journal.begin({ owner: 'owner', repository: 'repo', scope: 'organization', probe: 'projects',
            name: `Copilot permission test ${'d'.repeat(32)}` });
        const fetcher = jest.fn(async (url: string | URL | Request, options?: RequestInit) => {
            const token = new Headers(options?.headers).get('authorization');
            if (new URL(String(url)).pathname === '/graphql') {
                expect(token).toBe('Bearer bot-fixture');
                return reply(200, { data: { organization: { projectsV2: { nodes: [], pageInfo: { hasNextPage: false } } } } });
            }
            expect(token).toBe('Bearer operator-fixture');
            return reply(404);
        });
        await journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'bot-fixture', 1000),
            new SetupPermissionProbeHttp(fetcher, 'operator-fixture', 1000));
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(await readdir(folder)).toEqual([]);
    });
});
