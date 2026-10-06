import { createHash, randomBytes } from 'node:crypto';
import * as yaml from 'js-yaml';
import type { ResourceProbeContext } from './setup_permission_probe_context';
import { ProbeFailure, probeJsonRecord, probeResponseFailure } from './setup_permission_probe_http';

interface DispatchWorkflow { readonly id: number; readonly path: string; readonly sha: string; readonly trustedNoOp: boolean; }
const MAX_WORKFLOW_PAGES = 5;
const MAX_WORKFLOW_FILE_CHECKS = 64;

// Hash of the packaged credential-health workflow: every job is guarded by a
// false-by-default input. A different remote file is never dispatched directly.
const TRUSTED_HEALTH_WORKFLOW_SHA256 = '7fa36bf72d144df6fe2ccc45b805ad442187aa6979dfda71446a54f607b18d61';

/** Dispatches a disabled-job branch override of a workflow already registered on default. */
export async function probeActions(context: ResourceProbeContext): Promise<void> {
    const root = `https://api.github.com/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}`;
    const metadata = await probeJsonRecord(await context.http.expect(root, 'GET', [200]));
    const base = metadata.default_branch;
    if (typeof base !== 'string' || !/^[A-Za-z0-9._/-]{1,255}$/u.test(base)
        || base.startsWith('/') || base.endsWith('/')) {
        throw new ProbeFailure('GitHub did not provide a safe default branch for the temporary Actions check.');
    }
    const ref = await probeJsonRecord(await context.http.expect(
        `${root}/git/ref/heads/${encodeURIComponent(base)}`, 'GET', [200]));
    const object = ref.object;
    const sha = object && typeof object === 'object' && !Array.isArray(object)
        ? (object as Record<string, unknown>).sha : undefined;
    if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/u.test(sha)) {
        throw new ProbeFailure('GitHub did not return a valid default-branch commit for the Actions check.');
    }
    const workflow = await findDispatchWorkflow(context, root, sha);
    if (!workflow) {
        throw new ProbeFailure('No active default-branch workflow with workflow_dispatch is available for an isolated Actions check.',
            undefined, false, false, 'dispatch-workflow');
    }
    const name = `copilot-permission-test-${randomBytes(16).toString('hex')}`;
    const prior = await context.http.request(`${root}/git/ref/heads/${name}`);
    if (prior.status !== 404) throw new ProbeFailure(`Temporary branch absence was not confirmed (HTTP ${prior.status}).`, prior.status);
    const handle = await context.journal.begin({ owner: context.owner, repository: context.repository,
        scope: 'repository', probe: 'actions', name });
    let operationError: unknown;
    const noOp = "name: Temporary permission check\non:\n  workflow_dispatch:\njobs:\n  noop:\n    if: ${{ false }}\n    runs-on: ubuntu-latest\n    steps:\n      - run: 'true'\n";
    context.phase('creating');
    try {
        await handle.setReferenceSha(sha);
        try {
            await context.http.expect(`${root}/git/refs`, 'POST', [201], { ref: `refs/heads/${name}`, sha });
        } catch (error) {
            if (error instanceof ProbeFailure && error.httpStatus === 403) {
                throw new ProbeFailure('The isolated Actions check could not create its branch (HTTP 403); confirm repository Contents Write and organization authorization.',
                    403, false, false, 'contents-write');
            }
            throw error;
        }
        if (!workflow.trustedNoOp) {
            const file = `${root}/contents/${workflow.path}`;
            try {
                const written = await probeJsonRecord(await context.http.expect(file, 'PUT', [200], {
                    message: 'chore: verify temporary Actions permission [skip ci]',
                    content: Buffer.from(noOp, 'utf8').toString('base64'), branch: name, sha: workflow.sha,
                }));
                await handle.setReferenceSha((written.commit as Record<string, unknown> | undefined)?.sha);
            } catch (error) {
                if (error instanceof ProbeFailure && error.httpStatus === 403) {
                    throw new ProbeFailure('The isolated Actions check could not write its no-job override (HTTP 403); confirm repository Contents and Workflows Write and organization authorization.',
                        403, false, false, 'contents-workflows-write');
                }
                throw error;
            }
            const observedFile = await probeJsonRecord(await context.http.expect(`${file}?ref=${name}`, 'GET', [200]));
            if (observedFile.path !== workflow.path || observedFile.encoding !== 'base64'
                || typeof observedFile.content !== 'string'
                || Buffer.from(observedFile.content, 'base64').toString('utf8') !== noOp) {
                throw new ProbeFailure('The temporary no-job workflow was not confirmed on the isolated branch.');
            }
        }
        await handle.setDispatchWorkflowId(workflow.id);
        await handle.markDispatchAttempted();
        const dispatched = await context.http.request(`${root}/actions/workflows/${workflow.id}/dispatches`, 'POST',
            { ref: name, return_run_details: true });
        if (dispatched.status !== 200 && dispatched.status !== 204) {
            if (dispatched.status >= 400 && dispatched.status < 500) await handle.clearRejectedDispatch();
            throw await probeResponseFailure(dispatched, `GitHub Actions dispatch returned HTTP ${dispatched.status}.`);
        }
        const runId = dispatched.status === 200
            ? (await probeJsonRecord(dispatched)).workflow_run_id
            : await findAcceptedDispatchRun(context, root, name, workflow.id);
        if (!Number.isSafeInteger(runId) || (runId as number) <= 0) throw new ProbeFailure('GitHub did not identify the temporary Actions run.');
        await handle.setRunId(runId as number);
        context.phase('reading');
        const run = await probeJsonRecord(await context.http.expect(`${root}/actions/runs/${runId}`, 'GET', [200]));
        if (run.id !== runId || run.head_branch !== name || run.event !== 'workflow_dispatch'
            || run.workflow_id !== workflow.id) {
            throw new ProbeFailure('Temporary Actions run readback did not match the isolated dispatch.');
        }
    } catch (error) { operationError = error; }
    context.phase('deleting');
    try { await handle.cleanup(context.http); }
    catch { throw new ProbeFailure('Temporary Actions cleanup could not be confirmed; recovery is required before retrying.',
        undefined, true); }
    if (operationError) throw operationError;
}

/** Older GitHub dispatch responses omit the run ID even after accepting the request. */
async function findAcceptedDispatchRun(
    context: ResourceProbeContext, root: string, branch: string, workflowId: number,
): Promise<number> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await probeJsonRecord(await context.http.expect(
            `${root}/actions/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=100`, 'GET', [200]));
        if (!Array.isArray(response.workflow_runs)) throw new ProbeFailure('GitHub returned an invalid temporary Actions run list.');
        const matches = response.workflow_runs.filter(item => item && typeof item === 'object' && !Array.isArray(item)
            && (item as Record<string, unknown>).head_branch === branch
            && (item as Record<string, unknown>).event === 'workflow_dispatch'
            && (item as Record<string, unknown>).workflow_id === workflowId);
        if (matches.length > 1) throw new ProbeFailure('GitHub returned multiple temporary Actions runs for one dispatch.');
        if (matches.length === 1) {
            const id = (matches[0] as Record<string, unknown>).id;
            if (!Number.isSafeInteger(id) || (id as number) <= 0) throw new ProbeFailure('GitHub returned an invalid temporary Actions run ID.');
            return id as number;
        }
        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new ProbeFailure('GitHub accepted the temporary Actions dispatch but did not identify its run.');
}

async function findDispatchWorkflow(
    context: ResourceProbeContext, root: string, commitSha: string,
): Promise<DispatchWorkflow | undefined> {
    const candidates: Record<string, unknown>[] = [];
    let complete = false;
    for (let page = 1; page <= MAX_WORKFLOW_PAGES; page += 1) {
        const list = await probeJsonRecord(await context.http.expect(
            `${root}/actions/workflows?per_page=100&page=${page}`, 'GET', [200]));
        if (!Array.isArray(list.workflows) || list.workflows.length > 100) {
            throw new ProbeFailure('GitHub returned an invalid Actions workflow list.');
        }
        const total = list.total_count;
        if (total !== undefined && (!Number.isSafeInteger(total) || (total as number) < 0)) {
            throw new ProbeFailure('GitHub returned an invalid Actions workflow count.');
        }
        const pageCandidates = list.workflows.filter((item): item is Record<string, unknown> =>
            item && typeof item === 'object' && !Array.isArray(item));
        candidates.push(...pageCandidates);
        if (list.workflows.length < 100 || (total !== undefined && (total as number) <= page * 100)) {
            if (total !== undefined && (total as number) > (page - 1) * 100 + list.workflows.length) {
                throw new ProbeFailure('GitHub returned an incomplete Actions workflow page.');
            }
            complete = true;
            break;
        }
    }
    candidates.sort((a, b) => Number(b.path === '.github/workflows/copilot_credential_health.yml')
        - Number(a.path === '.github/workflows/copilot_credential_health.yml'));
    let checked = 0;
    for (const item of candidates) {
        const workflow = item;
        if (workflow.state !== 'active' || typeof workflow.path !== 'string'
            || !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u.test(workflow.path)
            || !Number.isSafeInteger(workflow.id) || (workflow.id as number) <= 0) continue;
        if (checked >= MAX_WORKFLOW_FILE_CHECKS) {
            throw new ProbeFailure('The bounded Actions workflow search could not inspect every candidate.');
        }
        checked += 1;
        const encodedPath = workflow.path.split('/').map(encodeURIComponent).join('/');
        const response = await context.http.request(`${root}/contents/${encodedPath}?ref=${commitSha}`);
        if (response.status !== 200) continue;
        const file = await probeJsonRecord(response);
        if (file.encoding !== 'base64' || typeof file.content !== 'string'
            || typeof file.sha !== 'string' || !/^[a-f0-9]{40}$/u.test(file.sha)) continue;
        const content = Buffer.from(file.content, 'base64').toString('utf8');
        if (hasWorkflowDispatch(content)) {
            const trustedNoOp = workflow.path === '.github/workflows/copilot_credential_health.yml'
                && createHash('sha256').update(content).digest('hex') === TRUSTED_HEALTH_WORKFLOW_SHA256;
            return { id: workflow.id as number, path: workflow.path, sha: file.sha, trustedNoOp };
        }
    }
    if (!complete) throw new ProbeFailure('The bounded Actions workflow search could not inspect every index page.');
    return undefined;
}

/** GitHub accepts scalar, event-list, and mapping forms of the top-level on key. */
export function hasWorkflowDispatch(content: string): boolean {
    let document: unknown;
    try { document = yaml.load(content); }
    catch { return false; }
    if (!document || typeof document !== 'object' || Array.isArray(document)) return false;
    const triggers = (document as Record<string, unknown>).on;
    if (typeof triggers === 'string') return triggers === 'workflow_dispatch';
    if (Array.isArray(triggers)) return triggers.includes('workflow_dispatch');
    return !!triggers && typeof triggers === 'object'
        && Object.prototype.hasOwnProperty.call(triggers, 'workflow_dispatch');
}
