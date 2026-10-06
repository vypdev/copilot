import { ProbeFailure, SetupPermissionProbeHttp, probeJsonRecord } from './setup_permission_probe_http';

export async function cleanupProject(http: SetupPermissionProbeHttp, owner: string, title: string, recordedId?: string): Promise<void> {
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
        if (!Array.isArray(list.nodes) || list.nodes.some(item => !item || typeof item !== 'object' || Array.isArray(item)
            || typeof item.title !== 'string' || typeof item.id !== 'string')) {
            throw new ProbeFailure('GitHub returned invalid Projects cleanup data.');
        }
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
