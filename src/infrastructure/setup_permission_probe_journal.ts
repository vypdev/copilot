import { cleanupPullRequest, cleanupActionRun } from './setup_permission_workflow_cleanup';
import { cleanupProject } from './setup_permission_project_cleanup';
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SetupTokenPermissionProbe, SetupTokenPermissionScope } from '../domain/setup_token_permissions';
import { ProbeCollision, ProbeFailure, SetupPermissionProbeHttp, probeJsonRecord } from './setup_permission_probe_http';
import { cleanupIssue } from './setup_permission_issue_cleanup';

interface ProbeJournalEntry {
    readonly version: 1 | 2;
    readonly owner: string;
    readonly repository: string;
    readonly scope: SetupTokenPermissionScope;
    readonly probe: SetupTokenPermissionProbe;
    readonly name: string;
    readonly remoteId?: string;
    readonly issueNumber?: number;
    readonly issueNodeId?: string;
    readonly runId?: number;
    readonly workflowId?: number;
    readonly dispatchAttempted?: true;
    readonly pullAttempted?: true;
    readonly referenceSha?: string;
    readonly incident?: 'secret-collision';
    readonly pid: number;
}

const supported = new Set<SetupTokenPermissionProbe>(['variables', 'secrets', 'issues', 'issue-types', 'contents', 'workflows', 'projects', 'pull-requests', 'actions']);

/** Legacy dispatched runs cannot be deleted without an independently verified workflow identity. */
export class LegacyActionsRecoveryRequired extends ProbeFailure {}

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
            await file.writeFile(JSON.stringify({ ...entry, version: 2, pid: process.pid } satisfies ProbeJournalEntry));
            await file.sync();
        } finally { await file.close(); }
        return new ProbeJournalHandle(path, { ...entry, version: 2, pid: process.pid });
    }

    async recover(owner: string, repository: string, http: SetupPermissionProbeHttp, operatorHttp?: SetupPermissionProbeHttp): Promise<void> {
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
            if (entry.incident === 'secret-collision') {
                throw new ProbeCollision('A previous Secret collision requires GitHub audit-trail review. Reconcile the incident before removing its local journal record.', undefined, true);
            }
            if (entry.pid !== process.pid && processIsRunning(entry.pid)) {
                throw new ProbeFailure('Another setup process has a temporary permission resource in progress.');
            }
            await new ProbeJournalHandle(join(this.root, name), entry).cleanup(entry.probe === 'actions' ? operatorHttp ?? http : http);
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

    async markSecretCollision(): Promise<void> {
        if (this.entry.probe !== 'secrets') throw new ProbeFailure('Invalid Secret incident journal target.');
        await this.update({ incident: 'secret-collision' });
    }

    async setRemoteId(remoteId: string): Promise<void> {
        if (this.entry.probe !== 'projects' || !/^[A-Za-z0-9_=-]{8,128}$/u.test(remoteId)) {
            throw new ProbeFailure('Temporary Project ID cannot be journaled safely.');
        }
        await this.update({ remoteId });
    }

    async setIssueIdentity(issueNumber: number, issueNodeId: string): Promise<void> {
        if (this.entry.probe !== 'issues' || !Number.isSafeInteger(issueNumber) || issueNumber <= 0
            || !/^[A-Za-z0-9_=-]{8,128}$/u.test(issueNodeId)) {
            throw new ProbeFailure('Temporary Issue identity cannot be journaled safely.');
        }
        await this.update({ issueNumber, issueNodeId });
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

    async setDispatchWorkflowId(workflowId: number): Promise<void> {
        if (this.entry.probe !== 'actions' || !Number.isSafeInteger(workflowId) || workflowId <= 0) {
            throw new ProbeFailure('Invalid temporary Actions workflow ID.');
        }
        await this.update({ workflowId });
    }

    async markPullAttempted(): Promise<void> {
        if (this.entry.probe !== 'pull-requests') throw new ProbeFailure('Invalid temporary pull-request journal update.');
        await this.update({ pullAttempted: true });
    }

    async setReferenceSha(referenceSha: unknown): Promise<void> {
        if (!['contents', 'workflows', 'pull-requests', 'actions'].includes(this.entry.probe)
            || typeof referenceSha !== 'string' || !/^[a-f0-9]{40}$/u.test(referenceSha)) {
            throw new ProbeFailure('Temporary reference update did not identify its exact commit.');
        }
        await this.update({ referenceSha });
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
            if (this.entry.version === 1 && this.entry.workflowId === undefined
                && (this.entry.dispatchAttempted || this.entry.runId !== undefined)) {
                throw new LegacyActionsRecoveryRequired(`Legacy Actions cleanup record has no workflow identity. Inspect workflow_dispatch runs for ${owner}/${repository} on temporary branch ${name}, cancel and delete only the verified temporary run, then remove that branch only after checking its recorded commit. Once GitHub cleanup is confirmed, remove only the journal file ${this.path} and retry setup.`);
            }
            await cleanupActionRun(http, root, name, this.entry.runId, this.entry.dispatchAttempted === true, this.entry.workflowId);
            await cleanupReference(http, root, name, this.entry.referenceSha);
        } else if (probe === 'pull-requests') {
            if (this.entry.pullAttempted) await cleanupPullRequest(http, root, owner, name);
            await cleanupReference(http, root, name, this.entry.referenceSha);
        } else if (probe === 'contents' || probe === 'workflows') {
            await cleanupReference(http, root, name, this.entry.referenceSha);
        } else if (probe === 'issue-types') {
            const list = `${root}/issue-types`;
            const matching = await matchingIssueTypeIds(http, list, name);
            if (matching.length > 1) throw new ProbeFailure('Multiple temporary Issue Types matched the cleanup name.');
            if (matching.length === 1) await http.expect(`${list}/${matching[0]}`, 'DELETE', [204]);
            if ((await matchingIssueTypeIds(http, list, name)).length !== 0) {
                throw new ProbeFailure('Temporary Issue Type cleanup could not be confirmed.');
            }
        } else if (probe === 'issues' && name.startsWith('Copilot permission test ')) {
            await cleanupIssue(http, owner, repository, name, this.entry.issueNumber, this.entry.issueNodeId);
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
    if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.name !== 'string' || !Number.isSafeInteger(item.id) || item.id <= 0)) {
        throw new ProbeFailure('GitHub returned invalid Issue Types cleanup data.');
    }
    return value.filter(item => item && typeof item === 'object' && (item as Record<string, unknown>).name === name)
        .map(item => item.id as number);
}

function validEntry(value: unknown): value is ProbeJournalEntry {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entry = value as Partial<ProbeJournalEntry>;
    return (entry.version === 1 || entry.version === 2) && typeof entry.owner === 'string' && typeof entry.repository === 'string'
        && (entry.scope === 'repository' || entry.scope === 'organization')
        && supported.has(entry.probe as SetupTokenPermissionProbe)
        && validScope(entry.scope, entry.probe as SetupTokenPermissionProbe)
        && typeof entry.name === 'string' && safeName(entry.probe as SetupTokenPermissionProbe, entry.name)
        && (entry.incident === undefined || (entry.version === 2 && entry.probe === 'secrets' && entry.incident === 'secret-collision'))
        && (entry.remoteId === undefined || (entry.probe === 'projects'
            && typeof entry.remoteId === 'string' && /^[A-Za-z0-9_=-]{8,128}$/u.test(entry.remoteId)))
        && (entry.issueNumber === undefined && entry.issueNodeId === undefined
            || (entry.probe === 'issues' && /^Copilot permission test [a-f0-9]{32}$/u.test(entry.name)
                && typeof entry.issueNumber === 'number' && Number.isSafeInteger(entry.issueNumber) && entry.issueNumber > 0
                && typeof entry.issueNodeId === 'string' && /^[A-Za-z0-9_=-]{8,128}$/u.test(entry.issueNodeId)))
        && (entry.runId === undefined || (entry.probe === 'actions'
            && typeof entry.runId === 'number' && Number.isSafeInteger(entry.runId) && entry.runId > 0))
        && (entry.workflowId === undefined || (entry.probe === 'actions'
            && typeof entry.workflowId === 'number' && Number.isSafeInteger(entry.workflowId) && entry.workflowId > 0))
        && (entry.dispatchAttempted === undefined || (entry.probe === 'actions' && entry.dispatchAttempted === true))
        && (entry.pullAttempted === undefined || (entry.probe === 'pull-requests' && entry.pullAttempted === true))
        && (entry.referenceSha === undefined || (['contents', 'workflows', 'pull-requests', 'actions'].includes(entry.probe!)
            && typeof entry.referenceSha === 'string' && /^[a-f0-9]{40}$/u.test(entry.referenceSha)))
        && typeof entry.pid === 'number' && Number.isSafeInteger(entry.pid) && entry.pid > 0;
}

function safeName(probe: SetupTokenPermissionProbe, name: string): boolean {
    return probe === 'issue-types' || probe === 'projects'
        ? /^Copilot permission test [a-f0-9]{24,32}$/u.test(name)
        : probe === 'contents' || probe === 'workflows' || probe === 'pull-requests' || probe === 'actions'
            ? /^copilot-permission-test-[a-f0-9]{32}$/u.test(name)
        : probe === 'issues'
                ? /^(?:Copilot permission test |copilot-probe-|copilot-permission-test-)[a-f0-9]{32}$/u.test(name)
                : probe === 'secrets'
                    ? /^COPILOT_PERMISSION_TEST_[A-F0-9]{32}(?:[A-F0-9]{32})?$/u.test(name)
                    : /^COPILOT_PERMISSION_TEST_[A-F0-9]{32}$/u.test(name);
}

function validScope(scope: SetupTokenPermissionScope, probe: SetupTokenPermissionProbe): boolean {
    return (scope === 'repository' && probe !== 'issue-types' && probe !== 'projects')
        || (scope === 'organization'
        && (probe === 'variables' || probe === 'secrets' || probe === 'issue-types' || probe === 'projects'));
}

async function cleanupReference(http: SetupPermissionProbeHttp, root: string, name: string, expectedSha?: string): Promise<void> {
    const exact = `${root}/git/ref/heads/${encodeURIComponent(name)}`;
    const before = await http.request(exact);
    if (before.status === 200) {
        const ref = await probeJsonRecord(before);
        const object = ref.object;
        if (!expectedSha || ref.ref !== `refs/heads/${name}` || !object || typeof object !== 'object'
            || Array.isArray(object) || (object as Record<string, unknown>).sha !== expectedSha) {
            throw new ProbeFailure('Temporary reference changed or has no recorded commit; inspect the recovery journal before removing it.', undefined, true);
        }
        await http.expect(`${root}/git/refs/heads/${encodeURIComponent(name)}`, 'DELETE', [204]);
    }
    else if (before.status !== 404) throw new ProbeFailure(`Temporary reference cleanup check returned HTTP ${before.status}.`, before.status);
    const after = await http.request(exact);
    if (after.status !== 404) throw new ProbeFailure(`Temporary reference cleanup could not be confirmed (HTTP ${after.status}).`, after.status);
}

function processIsRunning(pid: number): boolean {
    try { process.kill(pid, 0); return true; }
    catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}
