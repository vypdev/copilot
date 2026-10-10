import { randomBytes } from 'node:crypto';
import { ProbeFailure, probeJsonRecord } from './setup_permission_probe_http';
import type { ResourceProbeContext } from './setup_permission_probe_context';

/** The Project is private by default; only its exact ID may be deleted. */
export async function probeOrganizationProject(context: ResourceProbeContext): Promise<void> {
    const title = `Copilot permission test ${randomBytes(16).toString('hex')}`;
    const metadata = await probeJsonRecord(await context.http.expect(
        `https://api.github.com/orgs/${encodeURIComponent(context.owner)}`, 'GET', [200]));
    const ownerId = metadata.node_id;
    if (typeof ownerId !== 'string' || !/^[A-Za-z0-9_=-]{8,128}$/u.test(ownerId)) {
        throw new ProbeFailure('GitHub did not return a valid organization node ID.');
    }
    const handle = await context.journal.begin({ owner: context.owner, repository: context.repository,
        scope: 'organization', probe: 'projects', name: title });
    let operationError: unknown;
    context.phase('creating');
    try {
        const created = await projectGraphQl(context, `mutation($owner:ID!,$title:String!){createProjectV2(input:{ownerId:$owner,title:$title}){projectV2{id title}}}`, { owner: ownerId, title });
        const project = field(field(created, 'createProjectV2'), 'projectV2');
        const id = project.id;
        if (typeof id !== 'string' || !/^[A-Za-z0-9_=-]{8,128}$/u.test(id) || project.title !== title) {
            throw new ProbeFailure('GitHub did not identify the temporary Project for cleanup.');
        }
        await handle.setRemoteId(id);
        context.phase('reading');
        const read = await projectGraphQl(context, `query($id:ID!){node(id:$id){... on ProjectV2{id title}}}`, { id });
        const observed = field(read, 'node');
        if (observed.id !== id || observed.title !== title) {
            throw new ProbeFailure('Temporary Project readback did not match the created Project.');
        }
    } catch (error) { operationError = error; }
    context.phase('deleting');
    try { await handle.cleanup(context.http); }
    catch { throw new ProbeFailure('Temporary Project cleanup could not be confirmed; recovery is required before retrying.',
        undefined, true); }
    if (operationError) throw operationError;
}

async function projectGraphQl(context: ResourceProbeContext, query: string, variables: Record<string, string>): Promise<Record<string, unknown>> {
    const response = await context.http.expect('https://api.github.com/graphql', 'POST', [200], { query, variables });
    const body = await probeJsonRecord(response);
    if (Array.isArray(body.errors) && body.errors.length > 0) throw new ProbeFailure('GitHub rejected the temporary Project operation.');
    return field(body, 'data');
}

function field(value: Record<string, unknown>, key: string): Record<string, unknown> {
    const child = value[key];
    if (!child || typeof child !== 'object' || Array.isArray(child)) {
        throw new ProbeFailure('GitHub returned an invalid temporary Project response.');
    }
    return child as Record<string, unknown>;
}
