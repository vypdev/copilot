import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import { SetupPermissionProbeJournal } from '../setup_permission_probe_journal';
import { SetupTokenPermissionsUseCase } from '../../application/usecases/setup/setup_token_permissions_use_case';
import { VerifySetupPatBootstrapUseCase } from '../../application/usecases/setup/verify_setup_pat_bootstrap_use_case';
import { buildSetupPatPermissionRequirements } from '../../application/policies/setup_token_permission_policy';

const reply = (status: number, payload?: unknown) => ({ status, ok: status < 300,
    json: async () => payload, headers: { get: () => null } }) as unknown as Response;

describe('initial PAT transactions across application and GitHub adapters', () => {
    let root: string;
    beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'copilot-bootstrap-')); });
    afterEach(async () => { await rm(root, { recursive: true, force: true }); });

    test.each([
        ['repository', 'required', false, true], ['repository', 'conditional', false, true],
        ['organization', 'conditional', false, true], ['repository', 'required', true, true],
        ['repository', 'required', false, false],
    ] as const)('%s %s: preview=%s account=%s', async (scope, applicability, previewOnly, accountAccepted) => {
        let resource: { name: string; value: string } | undefined;
        const events: string[] = [];
        const journal = new SetupPermissionProbeJournal(root);
        const recovery = jest.spyOn(journal, 'recover');
        const fetcher = jest.fn(async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
            const method = options?.method ?? 'GET';
            events.push(method);
            if (String(url).endsWith('/repos/owner/repo')) return reply(200, {
                id: 1, full_name: 'owner/repo', private: true, owner: { login: 'owner', type: 'Organization' },
            });
            if (method === 'POST') { resource = JSON.parse(options?.body as string); return reply(201); }
            if (method === 'DELETE') { resource = undefined; return reply(204); }
            return resource ? reply(200, resource) : reply(404);
        });
        const requirements = buildSetupPatPermissionRequirements().filter(item => item.probe === 'metadata'
            || (item.probe === 'variables' && item.scope === scope)).map(item => item.level === 'write'
                ? { ...item, applicability } : item);
        const bootstrap = new VerifySetupPatBootstrapUseCase({
            permissions: new SetupTokenPermissionsUseCase({ validateSetupPat: async () => ({
                name: 'SETUP_PAT', status: 'valid', message: 'valid', account: 'operator',
            }) }, new SetupTokenPermissionQueryAdapter({ journal, fetcher })),
            presenter: { showRequirements() {}, showReport() {} },
            confirmAccount: async () => { events.push('confirm-account'); return accountAccepted; },
            confirmUnverifiable: async () => false, showCorrectedLink() {},
        });
        const execution = bootstrap.execute({ owner: 'owner', repository: 'repo', token: 'fixture', requirements,
            guided: false, previewOnly });
        if (accountAccepted) await expect(execution).resolves.toBe('operator');
        else await expect(execution).rejects.toThrow('unintended account');
        expect(resource).toBeUndefined();
        expect(await readdir(root)).toEqual([]);
        const shouldWrite = accountAccepted && !previewOnly;
        expect(events.includes('POST')).toBe(shouldWrite);
        expect(recovery).toHaveBeenCalledTimes(shouldWrite ? 1 : 0);
        if (shouldWrite) {
            expect(events.indexOf('confirm-account')).toBeLessThan(events.indexOf('POST'));
            expect(events.filter(event => event === 'DELETE')).toHaveLength(1);
        }
    });

    test('organization writes cannot follow a personal-owner assertion', async () => {
        const journal = new SetupPermissionProbeJournal(root);
        const fetcher = jest.fn().mockResolvedValue(reply(200, { id: 1, full_name: 'owner/repo',
            owner: { login: 'owner', type: 'User' } }));
        const requirement = buildSetupPatPermissionRequirements().find(item => item.scope === 'organization' && item.probe === 'variables')!;
        const [check] = await new SetupTokenPermissionQueryAdapter({ journal, fetcher }).inspect(
            'owner', 'repo', 'fixture', [requirement], undefined, undefined, true);
        expect(check).toMatchObject({ status: 'unverifiable', message: expect.stringContaining('organization owner') });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(await readdir(root)).toEqual([]);
    });
});
