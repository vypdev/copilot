import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SetupTokenPermissionProbe, SetupTokenPermissionScope } from '../domain/setup_token_permissions';
import { ProbeFailure, SetupPermissionProbeHttp, probeJsonRecord } from './setup_permission_probe_http';

interface ProbeJournalEntry {
    readonly version: 1;
    readonly owner: string;
    readonly repository: string;
    readonly scope: SetupTokenPermissionScope;
    readonly probe: SetupTokenPermissionProbe;
    readonly name: string;
    readonly remoteId?: string;
    readonly runId?: number;
    readonly dispatchAttempted?: true;
    readonly pullAttempted?: true;
    readonly pid: number;
}

const supported = new Set<SetupTokenPermissionProbe>(['variables', 'secrets', 'issues', 'issue-types', 'contents', 'workflows', 'projects', 'pull-requests', 'actions']);

/** No token or test value is persisted. A file exists before the first remote mutation. */
export class SetupPermissionProbeJournal {
    constructor(private readonly root = join(homedir(), '.copilot', 'setup-permission-probes')) {}

    async begin(entry: Omit<ProbeJournalEntry, 'version' | 'pid'>): Promise<ProbeJournalHandle> {
        if (!supported.has(entry.probe) || !validScope(entry.scope, entry.probe) || !safeName(entry.probe, entry.name)) {
            throw new ProbeFailure('Temporary resource journal rejected an unsafe target.');
        }
        await mkdir(this.root, { recursive: true, mode: 0o700 });
        await this.assertPrivateRoot();
        const path = join(this.root, `${randomBytes(16).toString('hex')}.json`);
        const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        try {
            await file.writeFile(JSON.stringify({ ...entry, version: 1, pid: process.pid } satisfies ProbeJournalEntry));
            await file.sync();
        } finally { await file.close(); }
        return new ProbeJournalHandle(path, { ...entry, version: 1, pid: process.pid });
    }

    async recover(owner: string, repository: string, http: SetupPermissionProbeHttp): Promise<void> {
        let names: string[];
        try { names = await readdir(this.root); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw new ProbeFailure('Could not inspect pending temporary-resource cleanup.');
        }
        await this.assertPrivateRoot();
        for (const name of names.filter(value => /^[a-f0-9]{32}\.json$/u.test(value))) {
            let entry: ProbeJournalEntry;
            try { entry = JSON.parse(await readFile(join(this.root, name), 'utf8')) as ProbeJournalEntry; }
            catch { throw new ProbeFailure('A temporary-resource cleanup record could not be read.'); }
            if (!validEntry(entry)) throw new ProbeFailure('A temporary-resource cleanup record is invalid.');
            if (entry.owner !== owner || entry.repository !== repository) continue;
            if (entry.pid !== process.pid && processIsRunning(entry.pid)) {
                throw new ProbeFailure('Another setup process has a temporary permission resource in progress.');
            }
            await new ProbeJournalHandle(join(this.root, name), entry).cleanup(http);
        }
    }

    private async assertPrivateRoot(): Promise<void> {
        const stat = await lstat(this.root);
        if (!stat.isDirectory() || stat.isSymbolicLink()
            || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
            || (process.getuid && stat.uid !== process.getuid())) {
            throw new ProbeFailure('Temporary resource journal directory is not private.');
        }
    }
}

export class ProbeJournalHandle {
    constructor(private readonly path: string, private readonly entry: ProbeJournalEntry) {}

    /** Use only when GitHub definitively rejected creation before ownership was established. */
    async dismiss(): Promise<void> { await unlink(this.path); }

    async setRemoteId(remoteId: string): Promise<void> {
        if (this.entry.probe !== 'projects' || !/^[A-Za-z0-9_=-]{8,128}$/u.test(remoteId)) {
            throw new ProbeFailure('Temporary Project ID cannot be journaled safely.');
        }
        await this.update({ remoteId });
    }

    async markDispatchAttempted(): Promise<void> {
        if (this.entry.probe !== 'actions') throw new ProbeFailure('Invalid temporary Actions journal update.');
        await this.update({ dispatchAttempted: true });
    }

    async clearRejectedDispatch(): Promise<void> {
        if (this.entry.probe !== 'actions' || this.entry.runId !== undefined) {
            throw new ProbeFailure('Invalid temporary Actions journal update.');
        }
        const { dispatchAttempted: _removed, ...rest } = this.entry;
        await this.replace(rest);
    }

    async setRunId(runId: number): Promise<void> {
        if (this.entry.probe !== 'actions' || !Number.isSafeInteger(runId) || runId <= 0) {
            throw new ProbeFailure('Invalid temporary Actions run ID.');
        }
        await this.update({ runId });
    }

    async markPullAttempted(): Promise<void> {
        if (this.entry.probe !== 'pull-requests') throw new ProbeFailure('Invalid temporary pull-request journal update.');
        await this.update({ pullAttempted: true });
    }

    async clearRejectedPull(): Promise<void> {
        if (this.entry.probe !== 'pull-requests') throw new ProbeFailure('Invalid temporary pull-request journal update.');
        const { pullAttempted: _removed, ...rest } = this.entry;
        await this.replace(rest);
    }

    private async update(fields: Partial<ProbeJournalEntry>): Promise<void> {
        await this.replace({ ...this.entry, ...fields });
    }

    private async replace(next: ProbeJournalEntry): Promise<void> {
        const temp = `${this.path}.${randomBytes(8).toString('hex')}.tmp`;
        const file = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        try { await file.writeFile(JSON.stringify(next)); await file.sync(); }
        finally { await file.close(); }
        await rename(temp, this.path);
        Object.assign(this.entry, next);
        if (!next.dispatchAttempted) delete (this.entry as { dispatchAttempted?: true }).dispatchAttempted;
        if (!next.pullAttempted) delete (this.entry as { pullAttempted?: true }).pullAttempted;
    }

    async cleanup(http: SetupPermissionProbeHttp): Promise<void> {
        const { owner, repository, scope, probe, name } = this.entry;
        const root = scope === 'organization'
            ? `https://api.github.com/orgs/${encodeURIComponent(owner)}`
            : `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
        if (probe === 'projects') {
            await cleanupProject(http, owner, name, this.entry.remoteId);
        } else if (probe === 'actions') {
            await cleanupActionRun(http, root, name, this.entry.runId, this.entry.dispatchAttempted === true);
            await cleanupReference(http, root, name);
        } else if (probe === 'pull-requests') {
            if (this.entry.pullAttempted) await cleanupPullRequest(http, root, owner, name);
            await cleanupReference(http, root, name);
        } else if (probe === 'contents' || probe === 'workflows') {
            await cleanupReference(http, root, name);
        } else if (probe === 'issue-types') {
            const list = `${root}/issue-types`;
            const matching = await matchingIssueTypeIds(http, list, name);
            if (matching.length > 1) throw new ProbeFailure('Multiple temporary Issue Types matched the cleanup name.');
            if (matching.length === 1) await http.expect(`${list}/${matching[0]}`, 'DELETE', [204]);
            if ((await matchingIssueTypeIds(http, list, name)).length !== 0) {
                throw new ProbeFailure('Temporary Issue Type cleanup could not be confirmed.');
            }
        } else {
            const resource = probe === 'issues' ? 'labels' : `actions/${probe}`;
            const exact = `${root}/${resource}/${encodeURIComponent(name)}`;
            const before = await http.request(exact);
            if (before.status === 200) await http.expect(exact, 'DELETE', [204]);
            else if (before.status !== 404) throw new ProbeFailure(`Temporary resource cleanup check returned HTTP ${before.status}.`, before.status);
            const after = await http.request(exact);
            if (after.status !== 404) throw new ProbeFailure(`Temporary resource cleanup could not be confirmed (HTTP ${after.status}).`, after.status);
        }
        await unlink(this.path);
    }
}

async function matchingIssueTypeIds(http: SetupPermissionProbeHttp, url: string, name: string): Promise<number[]> {
    const response = await http.expect(url, 'GET', [200]);
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new ProbeFailure('GitHub returned invalid Issue Types cleanup data.'); }
    if (!Array.isArray(value)) throw new ProbeFailure('GitHub returned invalid Issue Types cleanup data.');
    return value.filter(item => item && typeof item === 'object' && (item as Record<string, unknown>).name === name)
        .map(item => (item as Record<string, unknown>).id)
        .filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0);
}

function validEntry(value: unknown): value is ProbeJournalEntry {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entry = value as Partial<ProbeJournalEntry>;
    return entry.version === 1 && typeof entry.owner === 'string' && typeof entry.repository === 'string'
        && (entry.scope === 'repository' || entry.scope === 'organization')
        && supported.has(entry.probe as SetupTokenPermissionProbe)
        && validScope(entry.scope, entry.probe as SetupTokenPermissionProbe)
        && typeof entry.name === 'string' && safeName(entry.probe as SetupTokenPermissionProbe, entry.name)
        && (entry.remoteId === undefined || (entry.probe === 'projects'
            && typeof entry.remoteId === 'string' && /^[A-Za-z0-9_=-]{8,128}$/u.test(entry.remoteId)))
        && (entry.runId === undefined || (entry.probe === 'actions'
            && typeof entry.runId === 'number' && Number.isSafeInteger(entry.runId) && entry.runId > 0))
        && (entry.dispatchAttempted === undefined || (entry.probe === 'actions' && entry.dispatchAttempted === true))
        && (entry.pullAttempted === undefined || (entry.probe === 'pull-requests' && entry.pullAttempted === true))
        && typeof entry.pid === 'number' && Number.isSafeInteger(entry.pid) && entry.pid > 0;
}

function safeName(probe: SetupTokenPermissionProbe, name: string): boolean {
    return probe === 'issue-types' || probe === 'projects'
        ? /^Copilot permission test [a-f0-9]{24,32}$/u.test(name)
        : probe === 'contents' || probe === 'workflows' || probe === 'pull-requests' || probe === 'actions'
            ? /^copilot-permission-test-[a-f0-9]{32}$/u.test(name)
        : probe === 'issues'
                ? /^(?:copilot-probe-|copilot-permission-test-)[a-f0-9]{32}$/u.test(name)
                : probe === 'secrets'
                    ? /^COPILOT_PERMISSION_TEST_[A-F0-9]{32}(?:[A-F0-9]{32})?$/u.test(name)
                    : /^COPILOT_PERMISSION_TEST_[A-F0-9]{32}$/u.test(name);
}

function validScope(scope: SetupTokenPermissionScope, probe: SetupTokenPermissionProbe): boolean {
    return (scope === 'repository' && probe !== 'issue-types' && probe !== 'projects')
        || (scope === 'organization'
        && (probe === 'variables' || probe === 'secrets' || probe === 'issue-types' || probe === 'projects'));
}

async function cleanupReference(http: SetupPermissionProbeHttp, root: string, name: string): Promise<void> {
    const exact = `${root}/git/ref/heads/${encodeURIComponent(name)}`;
    const before = await http.request(exact);
    if (before.status === 200) await http.expect(`${root}/git/refs/heads/${encodeURIComponent(name)}`, 'DELETE', [204]);
    else if (before.status !== 404) throw new ProbeFailure(`Temporary reference cleanup check returned HTTP ${before.status}.`, before.status);
    const after = await http.request(exact);
    if (after.status !== 404) throw new ProbeFailure(`Temporary reference cleanup could not be confirmed (HTTP ${after.status}).`, after.status);
}

async function cleanupPullRequest(http: SetupPermissionProbeHttp, root: string, owner: string, name: string): Promise<void> {
    const title = `Copilot permission test ${name.slice('copilot-permission-test-'.length)}`;
    const search = `${root}/pulls?state=all&head=${encodeURIComponent(`${owner}:${name}`)}&per_page=100`;
    const response = await http.expect(search, 'GET', [200]);
    let rows: unknown;
    try { rows = await response.json(); }
    catch { throw new ProbeFailure('GitHub returned invalid temporary pull-request cleanup data.'); }
    if (!Array.isArray(rows)) throw new ProbeFailure('GitHub returned invalid temporary pull-request cleanup data.');
    const matches = rows.filter(item => item && typeof item === 'object' && !Array.isArray(item)
        && (item as Record<string, unknown>).title === title
        && typeof (item as Record<string, unknown>).head === 'object'
        && ((item as Record<string, unknown>).head as Record<string, unknown>)?.ref === name);
    if (matches.length > 1) throw new ProbeFailure('Multiple temporary pull requests matched the cleanup branch.');
    if (matches.length === 0) return;
    const row = matches[0] as Record<string, unknown>;
    const number = row.number;
    if (!Number.isSafeInteger(number) || (number as number) <= 0 || row.merged_at) {
        throw new ProbeFailure('Temporary pull-request identity changed; automatic cleanup stopped.');
    }
    const exact = `${root}/pulls/${number}`;
    if (row.state === 'open') await http.expect(exact, 'PATCH', [200], { state: 'closed' });
    else if (row.state !== 'closed') throw new ProbeFailure('Temporary pull request has an unexpected state.');
    const after = await probeJsonRecord(await http.expect(exact, 'GET', [200]));
    if (after.number !== number || after.state !== 'closed' || after.title !== title) {
        throw new ProbeFailure('Temporary pull-request closure could not be confirmed.');
    }
}

async function cleanupActionRun(
    http: SetupPermissionProbeHttp, root: string, branch: string, recordedId?: number, attempted = false,
): Promise<void> {
    if (!attempted && recordedId === undefined) return;
    let id = recordedId;
    for (let attempt = 0; id === undefined && attempt < 6; attempt += 1) {
        const response = await http.expect(`${root}/actions/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=100`, 'GET', [200]);
        const body = await probeJsonRecord(response);
        if (!Array.isArray(body.workflow_runs)) throw new ProbeFailure('GitHub returned invalid temporary Actions run cleanup data.');
        const matches = body.workflow_runs.filter(item => item && typeof item === 'object' && !Array.isArray(item)
            && (item as Record<string, unknown>).head_branch === branch
            && (item as Record<string, unknown>).event === 'workflow_dispatch');
        if (matches.length > 1) throw new ProbeFailure('Multiple temporary Actions runs matched the cleanup branch.');
        if (matches.length === 1) {
            const candidate = (matches[0] as Record<string, unknown>).id;
            if (!Number.isSafeInteger(candidate) || (candidate as number) <= 0) {
                throw new ProbeFailure('GitHub returned an invalid temporary Actions run ID.');
            }
            id = candidate as number;
        } else if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (id === undefined) throw new ProbeFailure('Temporary Actions dispatch may have succeeded, but its run was not found for cleanup.');
    const exact = `${root}/actions/runs/${id}`;
    let run: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await http.request(exact);
        if (response.status === 404 && attempt === 7) return;
        if (response.status !== 200) {
            if (response.status === 404 && attempt < 7) { await new Promise(resolve => setTimeout(resolve, 500)); continue; }
            throw new ProbeFailure(`Temporary Actions run lookup returned HTTP ${response.status}.`, response.status);
        }
        run = await probeJsonRecord(response);
        if (run.id !== id || run.head_branch !== branch || run.event !== 'workflow_dispatch') {
            throw new ProbeFailure('Temporary Actions run identity changed; automatic deletion stopped.');
        }
        if (run.status === 'completed') break;
        if (attempt === 0) {
            const cancel = await http.request(`${exact}/cancel`, 'POST');
            if (cancel.status !== 202 && cancel.status !== 409) {
                throw new ProbeFailure(`Temporary Actions run cancellation returned HTTP ${cancel.status}.`, cancel.status);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (run?.status !== 'completed') throw new ProbeFailure('Temporary Actions run did not finish before cleanup deadline.');
    await http.expect(exact, 'DELETE', [204]);
    const after = await http.request(exact);
    if (after.status !== 404) throw new ProbeFailure(`Temporary Actions run deletion could not be confirmed (HTTP ${after.status}).`, after.status);
}

function processIsRunning(pid: number): boolean {
    try { process.kill(pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

async function cleanupProject(http: SetupPermissionProbeHttp, owner: string, title: string, recordedId?: string): Promise<void> {
    const id = recordedId ?? await findProjectByTitle(http, owner, title);
    if (!id) return;
    const before = await projectGraphQl(http, 'query($id:ID!){node(id:$id){... on ProjectV2{id title}}}', { id });
    if (before.node === null) return;
    if (!before.node || typeof before.node !== 'object' || Array.isArray(before.node)
        || (before.node as Record<string, unknown>).id !== id
        || (before.node as Record<string, unknown>).title !== title) {
        throw new ProbeFailure('Temporary Project identity changed; automatic deletion was stopped.');
    }
    const deleted = await projectGraphQl(http,
        'mutation($id:ID!){deleteProjectV2(input:{projectId:$id}){projectV2{id}}}', { id });
    const result = deleted.deleteProjectV2;
    if (!result || typeof result !== 'object' || Array.isArray(result)
        || !(result as Record<string, unknown>).projectV2
        || typeof (result as Record<string, unknown>).projectV2 !== 'object'
        || ((result as Record<string, unknown>).projectV2 as Record<string, unknown>).id !== id) {
        throw new ProbeFailure('GitHub did not confirm deletion of the temporary Project.');
    }
    const after = await projectGraphQl(http, 'query($id:ID!){node(id:$id){... on ProjectV2{id title}}}', { id });
    if (after.node !== null) throw new ProbeFailure('Temporary Project cleanup could not be confirmed.');
}

async function findProjectByTitle(http: SetupPermissionProbeHttp, owner: string, title: string): Promise<string | undefined> {
    let after: string | null = null;
    const matches: string[] = [];
    for (let page = 0; page < 5; page += 1) {
        const data = await projectGraphQl(http,
            'query($owner:String!,$title:String!,$after:String){organization(login:$owner){projectsV2(first:100,after:$after,query:$title){nodes{id title} pageInfo{hasNextPage endCursor}}}}',
            { owner, title, after });
        const organization = data.organization;
        if (!organization || typeof organization !== 'object' || Array.isArray(organization)) {
            throw new ProbeFailure('GitHub did not return organization Projects for cleanup.');
        }
        const projects = (organization as Record<string, unknown>).projectsV2;
        if (!projects || typeof projects !== 'object' || Array.isArray(projects)) {
            throw new ProbeFailure('GitHub returned invalid Projects cleanup data.');
        }
        const list = projects as Record<string, unknown>;
        if (!Array.isArray(list.nodes)) throw new ProbeFailure('GitHub returned invalid Projects cleanup data.');
        for (const item of list.nodes) {
            if (item && typeof item === 'object' && !Array.isArray(item)
                && (item as Record<string, unknown>).title === title) {
                const id = (item as Record<string, unknown>).id;
                if (typeof id !== 'string' || !/^[A-Za-z0-9_=-]{8,128}$/u.test(id)) {
                    throw new ProbeFailure('GitHub returned an invalid temporary Project ID.');
                }
                matches.push(id);
            }
        }
        const pageInfo = list.pageInfo;
        if (!pageInfo || typeof pageInfo !== 'object' || Array.isArray(pageInfo)) {
            throw new ProbeFailure('GitHub returned invalid Projects pagination data.');
        }
        const pageState = pageInfo as Record<string, unknown>;
        if (pageState.hasNextPage === false) break;
        if (pageState.hasNextPage !== true || typeof pageState.endCursor !== 'string'
            || pageState.endCursor.length > 256 || page === 4) {
            throw new ProbeFailure('Temporary Project cleanup exceeded the bounded organization scan.');
        }
        after = pageState.endCursor;
    }
    if (matches.length > 1) throw new ProbeFailure('Multiple Projects matched the temporary cleanup name.');
    return matches[0];
}

async function projectGraphQl(http: SetupPermissionProbeHttp, query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await http.expect('https://api.github.com/graphql', 'POST', [200], { query, variables });
    const body = await probeJsonRecord(response);
    if (Array.isArray(body.errors) && body.errors.length > 0) throw new ProbeFailure('GitHub rejected temporary Project cleanup.');
    const data = body.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new ProbeFailure('GitHub returned invalid temporary Project cleanup data.');
    }
    return data as Record<string, unknown>;
}
