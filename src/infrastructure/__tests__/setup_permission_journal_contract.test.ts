import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetupPermissionProbeJournal } from '../setup_permission_probe_journal';
import { SetupPermissionProbeHttp } from '../setup_permission_probe_http';

const variableName = `COPILOT_PERMISSION_TEST_${'A'.repeat(32)}`;
const refName = `copilot-permission-test-${'a'.repeat(32)}`;
const json = (body: unknown, status = 200) => new Response(status === 204 || status === 404 ? null : JSON.stringify(body), { status });

describe('PAT recovery journal schema and safety', () => {
    let folder: string;
    let journal: SetupPermissionProbeJournal;
    beforeEach(async () => { folder = await mkdtemp(join(tmpdir(), 'copilot-pat-journal-')); journal = new SetupPermissionProbeJournal(folder); });
    afterEach(async () => { await rm(folder, { recursive: true, force: true }); });
    const start = () => journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'variables', name: variableName });
    async function record() {
        const file = join(folder, (await readdir(folder))[0]);
        return { file, entry: JSON.parse(await readFile(file, 'utf8')) };
    }

    it('allows a first-run audit when no recovery directory exists', async () => {
        const fetcher = jest.fn();
        await expect(new SetupPermissionProbeJournal(join(folder, 'missing')).recover('owner', 'repo',
            new SetupPermissionProbeHttp(fetcher, 'fixture', 1000))).resolves.toBeUndefined();
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('blocks unreadable recovery storage before making provider requests', async () => {
        const file = join(folder, 'not-a-directory');
        await writeFile(file, 'fixture');
        const fetcher = jest.fn();
        await expect(new SetupPermissionProbeJournal(file).recover('owner', 'repo',
            new SetupPermissionProbeHttp(fetcher, 'fixture', 1000))).rejects.toThrow('Could not inspect');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it.each([
        ['setRemoteId', 'PVT_12345678'], ['setRemoteId', 'bad'], ['setIssueIdentity', 1, 'I_12345678'],
        ['markDispatchAttempted'], ['clearRejectedDispatch'], ['setRunId', 1], ['setDispatchWorkflowId', 123],
        ['markPullAttempted'], ['clearRejectedPull'], ['setReferenceSha', 'a'.repeat(40)], ['markSecretCollision'],
    ])('rejects an update for the wrong resource family: %s', async (method, ...args) => {
        const handle = await start();
        const { entry } = await record();
        await expect((handle as unknown as Record<string, (...values: unknown[]) => Promise<void>>)[String(method)](...args))
            .rejects.toThrow(/Invalid|cannot|not identify/u);
        expect((await record()).entry).toEqual(entry);
    });

    it.each([
        { version: 3 }, { pid: 0 }, { pid: '1' }, { owner: 1 }, { repository: null },
        { probe: 'checks' }, { scope: 'other' }, { name: 'foreign-resource' },
        { remoteId: 'PVT_12345678' }, { issueNumber: 7, issueNodeId: 'I_12345678' },
        { runId: 7 }, { workflowId: 123 }, { dispatchAttempted: true }, { pullAttempted: true },
        { referenceSha: 'bad' }, { incident: 'secret-collision' },
    ])('refuses a forged recovery record %j before contacting GitHub', async fields => {
        await start();
        const { file, entry } = await record();
        await writeFile(file, JSON.stringify({ ...entry, ...fields }));
        const fetcher = jest.fn();
        await expect(journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000)))
            .rejects.toThrow('invalid');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('reports unreadable JSON without exposing the contents', async () => {
        await writeFile(join(folder, `${'a'.repeat(32)}.json`), 'private provider payload');
        const fetcher = jest.fn();
        await expect(journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000)))
            .rejects.toThrow('could not be read');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('leaves another repository journal untouched', async () => {
        await start();
        const fetcher = jest.fn();
        await journal.recover('owner', 'other', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000));
        expect(fetcher).not.toHaveBeenCalled();
        expect(await readdir(folder)).toHaveLength(1);
    });
    it('blocks recovery owned by another live process', async () => {
        await start();
        const { file, entry } = await record();
        await writeFile(file, JSON.stringify({ ...entry, pid: process.ppid }));
        const fetcher = jest.fn();
        await expect(journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000)))
            .rejects.toThrow('Another setup process');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('recovers an abandoned version-one label journal without applying the Issues probe to it', async () => {
        const handle = await journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'issues',
            name: `copilot-probe-${'a'.repeat(32)}` });
        const { file, entry } = await record();
        await writeFile(file, JSON.stringify({ ...entry, version: 1, pid: 2_147_483_647 }));
        const fetcher = jest.fn().mockResolvedValue(json(null, 404));
        await journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000));
        expect(fetcher.mock.calls[0][0]).toContain('/labels/copilot-probe-');
        expect(await readdir(folder)).toEqual([]);
        expect(handle).toBeDefined();
    });
    it.each([undefined, 7])('gives legacy dispatched Actions journals a safe manual recovery path (run ID %s)', async runId => {
        await journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'actions', name: refName });
        const { file, entry } = await record();
        await writeFile(file, JSON.stringify({ ...entry, version: 1, pid: 2_147_483_647,
            dispatchAttempted: true, referenceSha: 'a'.repeat(40), ...(runId ? { runId } : {}) }));
        const fetcher = jest.fn();
        const error = await journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000))
            .catch(failure => failure);
        expect(error.message).toContain('Legacy Actions cleanup record has no workflow identity');
        expect(error.message).toContain(`owner/repo on temporary branch ${refName}`);
        expect(error.message).toContain(`journal file ${file}`);
        expect(error.message).toContain('Once GitHub cleanup is confirmed');
        expect(fetcher).not.toHaveBeenCalled();
        expect(await readdir(folder)).toHaveLength(1);
    });
    it('recovers the exact recorded Project ID without searching or deleting another Project', async () => {
        const handle = await journal.begin({ owner: 'owner', repository: 'repo', scope: 'organization', probe: 'projects',
            name: `Copilot permission test ${'a'.repeat(32)}` });
        await handle.setRemoteId('PVT_12345678');
        const { file, entry } = await record();
        await writeFile(file, JSON.stringify({ ...entry, pid: 2_147_483_647 }));
        const fetcher = jest.fn().mockResolvedValue(json({ data: { node: null } }));
        await journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000));
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetcher.mock.calls[0][1].body).variables).toEqual({ id: 'PVT_12345678' });
        expect(await readdir(folder)).toEqual([]);
    });
    it('still recovers a legacy Actions branch when no dispatch or run was recorded', async () => {
        await journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'actions', name: refName });
        const { file, entry } = await record();
        await writeFile(file, JSON.stringify({ ...entry, version: 1, pid: 2_147_483_647 }));
        const fetcher = jest.fn().mockResolvedValue(json(null, 404));
        await journal.recover('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000));
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls[0][0]).toContain(`/git/ref/heads/${refName}`);
        expect(await readdir(folder)).toEqual([]);
    });
    (process.platform === 'win32' ? it.skip : it)('rejects a non-private POSIX journal directory', async () => {
        await chmod(folder, 0o755);
        await expect(start()).rejects.toThrow('not private');
    });
    it.each([null, {}, [null], [{}], [{ name: 'test', id: '1' }], [{ name: 'test', id: 0 }]])(
        'does not mistake malformed Issue Types cleanup data for absence: %j', async body => {
            const handle = await journal.begin({ owner: 'owner', repository: 'repo', scope: 'organization', probe: 'issue-types',
                name: `Copilot permission test ${'a'.repeat(24)}` });
            const fetcher = jest.fn().mockResolvedValue(json(body));
            await expect(handle.cleanup(new SetupPermissionProbeHttp(fetcher, 'fixture', 1000))).rejects.toThrow('invalid Issue Types');
            expect(fetcher.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
            expect(await readdir(folder)).toHaveLength(1);
        });
    it.each(['lookup', 'still-present'])('retains a ref when cleanup is %s', async state => {
        const handle = await journal.begin({ owner: 'owner', repository: 'repo', scope: 'repository', probe: 'contents', name: refName });
        await handle.setReferenceSha('a'.repeat(40));
        const ref = { ref: `refs/heads/${refName}`, object: { sha: 'a'.repeat(40) } };
        const fetcher = state === 'lookup' ? jest.fn().mockResolvedValue(json({}, 503))
            : jest.fn().mockResolvedValueOnce(json(ref)).mockResolvedValueOnce(json(null, 204)).mockResolvedValueOnce(json(ref));
        await expect(handle.cleanup(new SetupPermissionProbeHttp(fetcher, 'fixture', 1000))).rejects.toThrow(/HTTP/u);
        expect(await readdir(folder)).toHaveLength(1);
    });
});
