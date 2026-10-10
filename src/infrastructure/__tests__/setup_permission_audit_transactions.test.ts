import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import { SetupPermissionProbeJournal } from '../setup_permission_probe_journal';
import type { SetupTokenPermissionProgress, SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

const requirement: SetupTokenPermissionRequirement = {
    id: 'setup.repository.variables', role: 'setup', scope: 'repository', permission: 'Variables', level: 'write',
    applicability: 'required', reason: 'Provision variables.', probe: 'variables',
};
const reply = (body: unknown, status = 200) => new Response(status === 204 || status === 404 ? null : JSON.stringify(body), { status });

describe('approved PAT transactions through the inspection boundary', () => {
    let folder: string;
    beforeEach(async () => { folder = await mkdtemp(join(tmpdir(), 'copilot-pat-transactions-')); });
    afterEach(async () => { await rm(folder, { recursive: true, force: true }); });

    it.each(['repository', 'organization', 'closed-view'] as const)('returns transaction proof and ordered phases only after %s cleanup', async mode => {
        const scope = mode === 'organization' ? 'organization' : 'repository';
        let stored: { name: string; value: string } | undefined;
        const events: SetupTokenPermissionProgress[] = [];
        const fetcher = jest.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            const url = new URL(String(input));
            if (url.pathname === '/repos/owner/repo') return reply({ id: 42 });
            if (init?.method === 'POST') { stored = JSON.parse(String(init.body)); return reply({}, 201); }
            if (init?.method === 'DELETE') { stored = undefined; return reply(null, 204); }
            return stored ? reply(stored) : reply(null, 404);
        });
        const journal = new SetupPermissionProbeJournal(folder);
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher, journal }).inspect('owner', 'repo', 'fixture', [
            { ...requirement, scope },
        ], event => { events.push(event); if (mode === 'closed-view') throw new Error('View closed.'); });
        expect(check).toMatchObject({ status: 'verified', writeProof: 'transaction' });
        expect(stored).toBeUndefined();
        expect(await readdir(folder)).toEqual([]);
        expect(events.map(event => event.phase)).toEqual(['checking', 'creating', 'reading', 'deleting', 'verified']);
    });

    it.each([
        [401, {}, 'missing'], [403, { message: 'Resource not accessible by personal access token' }, 'missing'],
        [403, { message: 'Forbidden' }, 'unverifiable'],
    ] as const)('propagates failed creation HTTP %s without emitting write success', async (status, body, expected) => {
        const events: SetupTokenPermissionProgress[] = [];
        const fetcher = jest.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
            init?.method === 'POST' ? reply(body, status) : reply(null, 404));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher, journal: new SetupPermissionProbeJournal(folder) })
            .inspect('owner', 'repo', 'fixture', [requirement], event => events.push(event));
        expect(check.status).toBe(expected);
        expect(check.writeProof).toBeUndefined();
        expect(events.at(-1)).toMatchObject({ phase: 'failed', detail: `http-${status}` });
        expect(await readdir(folder)).toEqual([]);
    });

    it('retains a failed cleanup and blocks the next inspection before another create', async () => {
        let stored: { name: string; value: string } | undefined;
        const events: SetupTokenPermissionProgress[] = [];
        const fetcher = jest.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            if (init?.method === 'POST') { stored = JSON.parse(String(init.body)); return reply({}, 201); }
            if (init?.method === 'DELETE') return reply({}, 503);
            return stored ? reply(stored) : reply(null, 404);
        });
        const adapter = new SetupTokenPermissionQueryAdapter({ fetcher, journal: new SetupPermissionProbeJournal(folder) });
        const [first] = await adapter.inspect('owner', 'repo', 'fixture', [requirement], event => events.push(event));
        expect(first).toMatchObject({ status: 'unverifiable', cleanupPending: true });
        expect(events.at(-1)).toMatchObject({ phase: 'failed', detail: 'cleanup-pending' });
        const [second] = await adapter.inspect('owner', 'repo', 'fixture', [requirement], event => events.push(event));
        expect(second).toMatchObject({ status: 'unverifiable', cleanupPending: true });
        expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
        expect(await readdir(folder)).toHaveLength(1);
    });

    it('preserves a Secret collision incident and never deletes a value it cannot own', async () => {
        const events: SetupTokenPermissionProgress[] = [];
        const fetcher = jest.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
            if (String(input).endsWith('/public-key')) return reply({ key_id: '1', key: Buffer.alloc(32, 1).toString('base64') });
            return init?.method === 'PUT' ? reply(null, 204) : reply(null, 404);
        });
        const adapter = new SetupTokenPermissionQueryAdapter({ fetcher, journal: new SetupPermissionProbeJournal(folder) });
        const secrets = { ...requirement, permission: 'Secrets', probe: 'secrets' as const };
        const [check] = await adapter.inspect('owner', 'repo', 'fixture', [secrets], event => events.push(event));
        expect(check).toMatchObject({ status: 'unverifiable', cleanupPending: true, incident: 'secret-collision' });
        expect(events.at(-1)).toMatchObject({ phase: 'failed', detail: 'secret-collision' });
        expect(fetcher.mock.calls.every(([, init]) => init?.method !== 'DELETE')).toBe(true);
        expect(await readdir(folder)).toHaveLength(1);
        const count = fetcher.mock.calls.length;
        const [retry] = await adapter.inspect('owner', 'repo', 'fixture', [secrets]);
        expect(retry).toMatchObject({ status: 'unverifiable', cleanupPending: true, incident: 'secret-collision' });
        expect(fetcher).toHaveBeenCalledTimes(count);
    });

    it('reports an unsupported write without issuing a provider request or assuming read proof', async () => {
        const events: SetupTokenPermissionProgress[] = [];
        const fetcher = jest.fn();
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher, journal: new SetupPermissionProbeJournal(folder) })
            .inspect('owner', 'repo', 'fixture', [{ ...requirement, permission: 'Checks', probe: 'checks' }], event => events.push(event));
        expect(check.status).toBe('unverifiable');
        expect(events.at(-1)).toMatchObject({ phase: 'failed', detail: 'unsupported' });
        expect(fetcher).not.toHaveBeenCalled();
    });
});
