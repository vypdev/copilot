import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupCredentialValidationAdapter } from '../setup_credential_validation_adapter';
import { SetupGithubIdentityQueryAdapter } from '../setup_github_identity_query_adapter';
import { SetupTokenPermissionQueryAdapter } from '../setup_token_permission_query_adapter';
import { SetupPermissionProbeJournal } from '../setup_permission_probe_journal';
import { SetupPermissionProbeHttp, writeProbeFailure } from '../setup_permission_probe_http';
import { buildGitAuthenticationEnvironment } from '../git_authentication_environment';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';
import { bufferHttpResponse } from '../http_deadline';

const json = (body: unknown, status = 200, headers?: RequestInit["headers"]) =>
    new Response(JSON.stringify(body), { status, headers });
const metadata: SetupTokenPermissionRequirement = {
    id: 'setup.repository.metadata', role: 'setup', scope: 'repository', permission: 'Metadata',
    level: 'read', applicability: 'required', reason: 'Identify repository.', probe: 'metadata',
};
const variable: SetupTokenPermissionRequirement = {
    ...metadata, id: 'setup.repository.variables', permission: 'Variables', level: 'write', probe: 'variables',
};

describe('PAT identity and evidence regressions', () => {
    it.each([204, 205])('preserves a bodyless HTTP %s response without attempting JSON consumption', async status => {
        const response = new Response(null, { status });
        await expect(bufferHttpResponse(response)).resolves.toBe(response);
        expect(response.bodyUsed).toBe(false);
    });
    it.each([null, [], {}, { id: '1', login: 'operator' }, { id: 1, login: 'bad\nlogin' }])(
        'blocks a malformed authenticated identity %j before repository inspection', async payload => {
            const fetcher = jest.fn().mockResolvedValue(json(payload));
            const check = await new SetupCredentialValidationAdapter({ fetcher }).validateSetupPat('owner', 'repo', 'fixture-token');
            expect(check.status).toBe('unverifiable');
            expect(fetcher).toHaveBeenCalledTimes(1);
            expect(JSON.stringify(check)).not.toContain('fixture-token');
        },
    );

    it.each([{}, { id: 1, full_name: 'other/repo' }, { id: -1, full_name: 'owner/repo' }])(
        'does not accept the wrong or malformed repository %j', async payload => {
            const fetcher = jest.fn().mockResolvedValueOnce(json({ id: 1, login: 'operator' }))
                .mockResolvedValueOnce(json(payload));
            expect((await new SetupCredentialValidationAdapter({ fetcher }).validateSetupPat('owner', 'repo', 'fixture')).status)
                .toBe('unverifiable');
        },
    );

    it('accepts the exact repository case-insensitively and disables credential redirects', async () => {
        const fetcher = jest.fn().mockResolvedValueOnce(json({ id: 1, login: 'operator' }))
            .mockResolvedValueOnce(json({ id: 2, full_name: 'OWNER/Repo' }));
        expect((await new SetupCredentialValidationAdapter({ fetcher }).validateSetupPat('owner', 'repo', 'fixture')).status).toBe('valid');
        expect(fetcher.mock.calls.every(([, init]) => init.redirect === 'error')).toBe(true);
    });

    it.each([
        [401, {}, undefined, 'invalid'],
        [403, { message: 'Resource not accessible by personal access token' }, undefined, 'invalid'],
        [403, { message: 'Forbidden' }, undefined, 'unverifiable'],
        [403, { message: 'Resource not accessible by personal access token' }, { 'x-ratelimit-remaining': '0' }, 'unverifiable'],
        [403, { message: 'Resource not accessible by personal access token' }, { 'x-github-sso': 'required' }, 'unverifiable'],
        [429, {}, undefined, 'unverifiable'],
        [503, {}, undefined, 'unverifiable'],
    ] as const)('classifies identity HTTP %i with %j and %j as %s', async (status, body, headers, expected) => {
        const fetcher = jest.fn().mockResolvedValue(json(body, status, headers));
        expect((await new SetupCredentialValidationAdapter({ fetcher }).validateSetupPat('owner', 'repo', 'fixture')).status).toBe(expected);
    });

    it('buffers native fetch metadata once rather than consuming the body twice', async () => {
        const fetcher = jest.fn().mockResolvedValue(json({ private: true }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect('owner', 'repo', 'fixture', [metadata]);
        expect(check.status).toBe('verified');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('proves Administration read with a protected endpoint without a repository visibility dependency', async () => {
        const fetcher = jest.fn().mockResolvedValue(json({ enabled: false }));
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect('owner', 'repo', 'fixture', [
            { ...metadata, id: 'setup.repository.administration', permission: 'Administration', probe: 'administration' },
        ]);
        expect(check.status).toBe('verified');
        expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/repos/owner/repo/actions/permissions');
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(check.publicReadEvidence).toBeUndefined();
    });

    it.each(['contents', 'actions', 'checks', 'variables', 'secrets', 'administration'] as const)(
        'rejects malformed 200 %s evidence instead of treating it as an empty read', async probe => {
            const fetcher = jest.fn(async (input: Parameters<typeof fetch>[0]) =>
                String(input).endsWith('/owner/repo') ? json({ private: true, default_branch: 'main' }) : json({}));
            const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher }).inspect('owner', 'repo', 'fixture', [
                { ...metadata, id: `setup.repository.${probe}`, permission: probe, probe },
            ]);
            expect(check.status).toBe('unverifiable');
            expect(check.operationallyAvailable).toBeUndefined();
        },
    );

    it.each(['bootstrap', 'guided', 'permission'] as const)('bounds a stalled %s identity/read body and drops late success', async mode => {
        jest.useFakeTimers();
        try {
            let release!: (value: unknown) => void;
            let signal: AbortSignal | undefined;
            let started!: () => void;
            const waiting = new Promise<void>(resolve => { started = resolve; });
            const events: unknown[] = [];
            const fetcher = jest.fn(async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
                signal = init?.signal ?? undefined;
                started();
                return { status: 200, ok: true, json: () => new Promise(resolve => { release = resolve; }) } as Response;
            });
            const result = mode === 'bootstrap'
                ? new SetupCredentialValidationAdapter({ fetcher, timeoutMs: 10 }).validateSetupPat('owner', 'repo', 'fixture')
                : mode === 'guided'
                    ? new SetupGithubIdentityQueryAdapter(fetcher, 10).identify('fixture').catch(error => error)
                    : new SetupTokenPermissionQueryAdapter({ fetcher, timeoutMs: 10 }).inspect('owner', 'repo', 'fixture', [metadata], event => events.push(event));
            await waiting;
            await jest.advanceTimersByTimeAsync(10);
            const bounded = await result;
            expect(signal?.aborted).toBe(true);
            if (Array.isArray(bounded)) expect(bounded[0].status).toBe('unverifiable');
            else if ('status' in bounded) expect(bounded.status).toBe('unverifiable');
            else expect(bounded).toBeInstanceOf(Error);
            release({ id: 1, login: 'operator', private: true });
            await jest.advanceTimersByTimeAsync(0);
            expect(fetcher).toHaveBeenCalledTimes(1);
            expect(events).not.toContainEqual(expect.objectContaining({ phase: 'verified' }));
        } finally { jest.useRealTimers(); }
    });

    it('scopes git authentication to GitHub while preserving the caller environment', () => {
        const base = { PATH: '/fixture/bin', LANG: 'C' };
        const environment = buildGitAuthenticationEnvironment('fixture-token', base)!;
        expect(environment.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
        expect(environment.PATH).toBe(base.PATH);
        expect(base).not.toHaveProperty('GIT_CONFIG_VALUE_0');
        expect(buildGitAuthenticationEnvironment('  ', base)).toBeUndefined();
    });

    it('prevents a concurrent inspection from recovering another active inspection in the same process', async () => {
        let release!: (value: Response) => void;
        let started!: () => void;
        const waiting = new Promise<void>(resolve => { started = resolve; });
        const fetcher = jest.fn(() => { started(); return new Promise<Response>(resolve => { release = resolve; }); });
        const recover = jest.fn().mockResolvedValue(undefined);
        const journal = { recover } as unknown as SetupPermissionProbeJournal;
        const adapter = new SetupTokenPermissionQueryAdapter({ fetcher, journal });
        const first = adapter.inspect('owner', 'repo', 'first', [metadata]);
        await waiting;
        const second = await new SetupTokenPermissionQueryAdapter({ fetcher, journal })
            .inspect('OWNER', 'Repo', 'second', [metadata]);
        expect(second[0].status).toBe('unverifiable');
        expect(second[0].message).toContain('in progress');
        expect(recover).not.toHaveBeenCalled();
        release(json({ private: true }));
        await expect(first).resolves.toEqual([expect.objectContaining({ status: 'verified' })]);
        fetcher.mockResolvedValue(json({ private: true }));
        await adapter.inspect('owner', 'repo', 'retry', [metadata]);
        expect(recover).not.toHaveBeenCalled();
    });

    it('blocks a selected Project role denial before creating any disposable Project', async () => {
        const fetcher = jest.fn().mockResolvedValue(json({ data: { organization: {
            login: 'owner', projectV2: { number: 7, viewerCanUpdate: false },
        } } }));
        const begin = jest.fn();
        const journal = { recover: jest.fn().mockResolvedValue(undefined), begin } as unknown as SetupPermissionProbeJournal;
        const [check] = await new SetupTokenPermissionQueryAdapter({ fetcher, journal }).inspect('owner', 'repo', 'fixture', [
            { ...variable, id: 'workflow.organization.projects', role: 'workflow', scope: 'organization', permission: 'Projects', probe: 'projects' },
        ], undefined, '7');
        expect(check.status).toBe('missing');
        expect(check.message).toContain('#7');
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(begin).not.toHaveBeenCalled();
    });
});

describe('PAT write cleanup regressions', () => {
    let folder: string;
    beforeEach(async () => { folder = await mkdtemp(join(tmpdir(), 'copilot-pat-audit-')); });
    afterEach(async () => { await rm(folder, { recursive: true, force: true }); });

    it.each(['changed', 'legacy'] as const)('retains a %s branch and its journal instead of deleting an unowned commit', async kind => {
        const name = `copilot-permission-test-${'a'.repeat(32)}`;
        const journal = new SetupPermissionProbeJournal(folder);
        const handle = await journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'contents', name });
        if (kind === 'changed') await handle.setReferenceSha('a'.repeat(40));
        const fetcher = jest.fn().mockResolvedValue(json({ ref: `refs/heads/${name}`, object: { sha: 'b'.repeat(40) } }));
        await expect(journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000)))
            .rejects.toThrow('Temporary reference changed');
        expect(fetcher.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
        expect(await readdir(folder)).toHaveLength(1);
    });

    it('cleans a journaled ref only when its exact name and recorded commit match', async () => {
        const name = `copilot-permission-test-${'a'.repeat(32)}`;
        const journal = new SetupPermissionProbeJournal(folder);
        const handle = await journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'contents', name });
        await handle.setReferenceSha('a'.repeat(40));
        const fetcher = jest.fn().mockResolvedValueOnce(json({ ref: `refs/heads/${name}`, object: { sha: 'a'.repeat(40) } }))
            .mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(null, { status: 404 }));
        await journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000));
        expect(fetcher.mock.calls[1][1].method).toBe('DELETE');
        expect(await readdir(folder)).toEqual([]);
    });

    it.each([
        [{ message: 'Resource not accessible by personal access token' }, undefined, 'missing'],
        [{ message: 'Forbidden' }, undefined, 'unverifiable'],
        [{ message: 'Permission denied' }, { 'retry-after': '60' }, 'unverifiable'],
    ] as const)('maps write 403 %j with %j as %s', async (body, headers, expected) => {
        const http = new SetupPermissionProbeHttp(jest.fn().mockResolvedValue(json(body, 403, headers)), 'fixture', 1000);
        const failure = await http.expect('https://api.github.com/repos/owner/repo/actions/variables', 'POST', [201], {})
            .catch(error => error);
        expect(writeProbeFailure(variable, failure).status).toBe(expected);
        expect(writeProbeFailure(variable, failure).message).not.toContain('Permission denied');
    });
});
