import { ProbeFailure, SetupPermissionProbeHttp, probeJsonRecord } from './setup_permission_probe_http';

export async function cleanupPullRequest(http: SetupPermissionProbeHttp, root: string, owner: string, name: string): Promise<void> {
    const title = `Copilot permission test ${name.slice('copilot-permission-test-'.length)}`;
    const search = `${root}/pulls?state=all&head=${encodeURIComponent(`${owner}:${name}`)}&per_page=100`;
    const response = await http.expect(search, 'GET', [200]);
    let rows: unknown;
    try { rows = await response.json(); }
    catch { throw new ProbeFailure('GitHub returned invalid temporary pull-request cleanup data.'); }
    if (!Array.isArray(rows) || rows.some(item => !item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.title !== 'string' || !item.head || typeof item.head !== 'object'
        || Array.isArray(item.head) || typeof item.head.ref !== 'string')) {
        throw new ProbeFailure('GitHub returned invalid temporary pull-request cleanup data.');
    }
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

export async function cleanupActionRun(
    http: SetupPermissionProbeHttp, root: string, branch: string, recordedId?: number, attempted = false, workflowId?: number,
): Promise<void> {
    if (!attempted && recordedId === undefined) return;
    let id = recordedId;
    for (let attempt = 0; id === undefined && attempt < 6; attempt += 1) {
        const response = await http.expect(`${root}/actions/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=100`, 'GET', [200]);
        const body = await probeJsonRecord(response);
        if (!Array.isArray(body.workflow_runs) || body.workflow_runs.some(item => !item || typeof item !== 'object'
            || Array.isArray(item) || typeof item.head_branch !== 'string' || typeof item.event !== 'string'
            || !Number.isSafeInteger(item.workflow_id) || item.workflow_id <= 0)) {
            throw new ProbeFailure('GitHub returned invalid temporary Actions run cleanup data.');
        }
        const matches = body.workflow_runs.filter(item => item && typeof item === 'object' && !Array.isArray(item)
            && (item as Record<string, unknown>).head_branch === branch
            && (item as Record<string, unknown>).event === 'workflow_dispatch'
            && (item as Record<string, unknown>).workflow_id === workflowId);
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
        if (workflowId === undefined || run.id !== id || run.head_branch !== branch || run.event !== 'workflow_dispatch'
            || run.workflow_id !== workflowId) {
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
