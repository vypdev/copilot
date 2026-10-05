import { randomBytes } from 'node:crypto';
import { encryptSecret } from '../data/repository/repository_variables_repository';
import { ProbeCollision, ProbeFailure, SetupPermissionProbeHttp, probeJsonRecord } from './setup_permission_probe_http';
import type { ResourceProbeContext } from './setup_permission_probe_context';
import { probeOrganizationProject } from './setup_permission_project_probe';
import { probePullRequest } from './setup_permission_pull_request_probe';
import { withProbeCleanup } from './setup_permission_probe_transaction';
import { probeActions } from './setup_permission_actions_probe';

/** Returns only after exact readback, deletion, and absence verification. */
export async function probeDisposableResource(context: ResourceProbeContext): Promise<void> {
    if (context.probe === 'variables') return probeVariable(context);
    if (context.probe === 'secrets') return probeSecret(context);
    if (context.probe === 'issues' && context.scope === 'repository') return probeIssueLabel(context);
    if (context.probe === 'issue-types' && context.scope === 'organization') return probeIssueType(context);
    if (context.probe === 'contents' && context.scope === 'repository') return probeReference(context);
    if (context.probe === 'workflows' && context.scope === 'repository') return probeWorkflowFile(context);
    if (context.probe === 'projects' && context.scope === 'organization') return probeOrganizationProject(context);
    if (context.probe === 'pull-requests' && context.scope === 'repository') return probePullRequest(context);
    if (context.probe === 'actions' && context.scope === 'repository') return probeActions(context);
    throw new ProbeFailure(`No isolated create/read/delete probe is implemented for ${context.scope} ${context.probe} Write.`);
}

function resourceName(): string { return `COPILOT_PERMISSION_TEST_${randomBytes(16).toString('hex').toUpperCase()}`; }
function secretName(): string { return `COPILOT_PERMISSION_TEST_${randomBytes(32).toString('hex').toUpperCase()}`; }
function repoRoot(context: ResourceProbeContext): string {
    return `https://api.github.com/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}`;
}
function orgRoot(context: ResourceProbeContext): string {
    return `https://api.github.com/orgs/${encodeURIComponent(context.owner)}`;
}

async function repositoryId(context: ResourceProbeContext): Promise<number> {
    const response = await context.http.expect(repoRoot(context), 'GET', [200]);
    const metadata = await probeJsonRecord(response);
    if (!Number.isSafeInteger(metadata.id) || (metadata.id as number) <= 0) {
        throw new ProbeFailure('GitHub repository metadata did not contain a valid repository ID.');
    }
    return metadata.id as number;
}

async function requireAbsent(http: SetupPermissionProbeHttp, url: string): Promise<void> {
    const response = await http.request(url);
    if (response.status !== 404) {
        throw new ProbeFailure(`Temporary resource absence was not confirmed (HTTP ${response.status}).`, response.status);
    }
}

async function probeVariable(context: ResourceProbeContext): Promise<void> {
    const name = resourceName();
    const root = context.scope === 'organization' ? `${orgRoot(context)}/actions/variables` : `${repoRoot(context)}/actions/variables`;
    const exact = `${root}/${name}`;
    const value = randomBytes(16).toString('hex');
    const body = context.scope === 'organization'
        ? { name, value, visibility: 'selected', selected_repository_ids: [await repositoryId(context)] }
        : { name, value };
    context.phase('creating');
    await requireAbsent(context.http, exact);
    await withProbeCleanup(context, name, async owned => {
        await context.http.expect(root, 'POST', [201], body);
        owned();
        context.phase('reading');
        const observed = await probeJsonRecord(await context.http.expect(exact, 'GET', [200]));
        if (observed.name !== name || observed.value !== value) throw new ProbeFailure('Temporary Variable readback did not match the created value.');
    });
}

async function probeSecret(context: ResourceProbeContext): Promise<void> {
    const name = secretName();
    const root = context.scope === 'organization' ? `${orgRoot(context)}/actions/secrets` : `${repoRoot(context)}/actions/secrets`;
    const exact = `${root}/${name}`;
    const key = await probeJsonRecord(await context.http.expect(`${root}/public-key`, 'GET', [200]));
    if (typeof key.key !== 'string' || typeof key.key_id !== 'string') throw new ProbeFailure('GitHub returned an invalid Secret public key.');
    const encrypted = encryptSecret(randomBytes(24).toString('hex'), key.key);
    const body = context.scope === 'organization'
        ? { encrypted_value: encrypted, key_id: key.key_id, visibility: 'selected', selected_repository_ids: [await repositoryId(context)] }
        : { encrypted_value: encrypted, key_id: key.key_id };
    context.phase('creating');
    await requireAbsent(context.http, exact);
    await withProbeCleanup(context, name, async owned => {
        const result = await context.http.request(exact, 'PUT', body);
        if (result.status === 204) throw new ProbeCollision('GitHub updated an existing Secret at the random temporary name. A concurrent Secret value may have been replaced; setup stopped and did not delete it. Inspect the GitHub Secret audit trail.', 204, true);
        if (result.status !== 201) throw new ProbeFailure(`GitHub PUT returned HTTP ${result.status}.`, result.status);
        owned();
        context.phase('reading');
        const observed = await probeJsonRecord(await context.http.expect(exact, 'GET', [200]));
        if (observed.name !== name) throw new ProbeFailure('Temporary Secret metadata readback did not match the created name.');
    });
}

async function probeIssueLabel(context: ResourceProbeContext): Promise<void> {
    const name = `copilot-probe-${randomBytes(16).toString('hex')}`;
    const root = `${repoRoot(context)}/labels`;
    const exact = `${root}/${encodeURIComponent(name)}`;
    context.phase('creating');
    await requireAbsent(context.http, exact);
    await withProbeCleanup(context, name, async owned => {
        await context.http.expect(root, 'POST', [201], { name, color: 'ededed', description: 'Temporary permission verification; safe to remove.' });
        owned();
        context.phase('reading');
        const observed = await probeJsonRecord(await context.http.expect(exact, 'GET', [200]));
        if (observed.name !== name) throw new ProbeFailure('Temporary label readback did not match the created name.');
    });
}

async function probeIssueType(context: ResourceProbeContext): Promise<void> {
    const name = `Copilot permission test ${randomBytes(12).toString('hex')}`;
    const root = `${orgRoot(context)}/issue-types`;
    context.phase('creating');
    await withProbeCleanup(context, name, async owned => {
        const created = await probeJsonRecord(await context.http.expect(root, 'POST', [200, 201], {
            name, is_enabled: false, description: 'Temporary permission verification; safe to remove.', color: 'gray',
        }));
        owned();
        const id = created.id;
        if (!Number.isSafeInteger(id) || (id as number) <= 0 || created.name !== name) {
            throw new ProbeFailure('GitHub did not identify the temporary Issue Type for cleanup.');
        }
        context.phase('reading');
        const listed: unknown = await (await context.http.expect(root, 'GET', [200])).json();
        if (!Array.isArray(listed) || !listed.some(item => item && typeof item === 'object'
            && (item as Record<string, unknown>).id === id && (item as Record<string, unknown>).name === name)) {
            throw new ProbeFailure('Temporary Issue Type was not found in the organization readback.');
        }
    });
}

async function defaultBranchSha(context: ResourceProbeContext): Promise<string> {
    const metadata = await probeJsonRecord(await context.http.expect(repoRoot(context), 'GET', [200]));
    const branch = metadata.default_branch;
    if (typeof branch !== 'string' || branch.length < 1 || branch.length > 255
        || Array.from(branch).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
        throw new ProbeFailure('GitHub did not provide a safe default branch for the temporary reference.');
    }
    const ref = await probeJsonRecord(await context.http.expect(`${repoRoot(context)}/git/ref/heads/${encodeURIComponent(branch)}`, 'GET', [200]));
    const object = ref.object;
    const sha = object && typeof object === 'object' && !Array.isArray(object)
        ? (object as Record<string, unknown>).sha : undefined;
    if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/u.test(sha)) {
        throw new ProbeFailure('GitHub did not provide a valid base commit for the temporary reference.');
    }
    return sha;
}

async function probeReference(context: ResourceProbeContext): Promise<void> {
    const name = `copilot-permission-test-${randomBytes(16).toString('hex')}`;
    const root = repoRoot(context);
    const sha = await defaultBranchSha(context);
    context.phase('creating');
    await requireAbsent(context.http, `${root}/git/ref/heads/${name}`);
    await withProbeCleanup(context, name, async owned => {
        await context.http.expect(`${root}/git/refs`, 'POST', [201], { ref: `refs/heads/${name}`, sha });
        owned();
        context.phase('reading');
        const observed = await probeJsonRecord(await context.http.expect(`${root}/git/ref/heads/${name}`, 'GET', [200]));
        if (observed.ref !== `refs/heads/${name}`) throw new ProbeFailure('Temporary reference readback did not match the created branch.');
    });
}

async function probeWorkflowFile(context: ResourceProbeContext): Promise<void> {
    const name = `copilot-permission-test-${randomBytes(16).toString('hex')}`;
    const root = repoRoot(context);
    const sha = await defaultBranchSha(context);
    const workflowPath = `.github/workflows/${name}.yml`;
    const workflowUrl = `${root}/contents/${workflowPath}`;
    const content = `name: Temporary permission check\non:\n  workflow_dispatch:\njobs:\n  noop:\n    if: false\n    runs-on: ubuntu-latest\n    steps:\n      - run: 'true'\n`;
    context.phase('creating');
    await requireAbsent(context.http, `${root}/git/ref/heads/${name}`);
    await withProbeCleanup(context, name, async owned => {
        await context.http.expect(`${root}/git/refs`, 'POST', [201], { ref: `refs/heads/${name}`, sha });
        owned();
        await context.http.expect(workflowUrl, 'PUT', [201], {
            message: 'chore: temporary permission verification',
            content: Buffer.from(content, 'utf8').toString('base64'), branch: name,
        });
        context.phase('reading');
        const observed = await probeJsonRecord(await context.http.expect(`${workflowUrl}?ref=${name}`, 'GET', [200]));
        if (observed.path !== workflowPath || observed.type !== 'file') {
            throw new ProbeFailure('Temporary workflow readback did not match the created file.');
        }
    });
}
