import { ProbeFailure, SetupPermissionProbeHttp, probeJsonRecord } from './setup_permission_probe_http';

interface IssueIdentity {
    readonly number: number;
    readonly nodeId: string;
}

/** Delete only the exact temporary Issue; close and retain the journal if deletion is unavailable. */
export async function cleanupIssue(
    http: SetupPermissionProbeHttp,
    owner: string,
    repository: string,
    title: string,
    recordedNumber?: number,
    recordedNodeId?: string,
): Promise<void> {
    const root = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    const identity = recordedNumber && recordedNodeId
        ? { number: recordedNumber, nodeId: recordedNodeId }
        : await findExactIssue(http, owner, repository, title, root);
    const exact = `${root}/issues/${identity.number}`;
    const lookup = await http.request(exact);
    if ((lookup.status === 404 || lookup.status === 410) && recordedNumber && recordedNodeId) return;
    if (lookup.status !== 200) throw new ProbeFailure(`Temporary Issue lookup returned HTTP ${lookup.status}.`, lookup.status, true);
    const before = await probeJsonRecord(lookup);
    assertExactIssue(before, identity, title, root);

    let deletionConfirmed = false;
    try {
        const response = await probeJsonRecord(await http.expect('https://api.github.com/graphql', 'POST', [200], {
            query: 'mutation DeleteTemporaryIssue($id: ID!) { deleteIssue(input: { issueId: $id }) { repository { nameWithOwner } } }',
            variables: { id: identity.nodeId },
        }));
        const data = response.data;
        const result = data && typeof data === 'object' && !Array.isArray(data)
            ? (data as Record<string, unknown>).deleteIssue : undefined;
        const returnedRepository = result && typeof result === 'object' && !Array.isArray(result)
            ? (result as Record<string, unknown>).repository : undefined;
        const nameWithOwner = returnedRepository && typeof returnedRepository === 'object' && !Array.isArray(returnedRepository)
            ? (returnedRepository as Record<string, unknown>).nameWithOwner : undefined;
        if (response.errors === undefined && nameWithOwner === `${owner}/${repository}`) {
            const after = await http.request(exact);
            deletionConfirmed = after.status === 404 || after.status === 410;
        }
    } catch { /* A denied or ambiguous delete still needs exact Issue closure. */ }
    if (deletionConfirmed) return;

    try {
        await http.expect(exact, 'PATCH', [200], { state: 'closed', state_reason: 'not_planned' });
        const closed = await probeJsonRecord(await http.expect(exact, 'GET', [200]));
        assertExactIssue(closed, identity, title, root);
        if (closed.state !== 'closed') throw new ProbeFailure('Temporary Issue closure was not confirmed.');
    } catch {
        throw new ProbeFailure(`Temporary Issue #${identity.number} could not be deleted or confirmed closed; inspect it in GitHub before retrying.`,
            undefined, true);
    }
    throw new ProbeFailure(`Temporary Issue #${identity.number} remains closed because GitHub did not confirm deletion; remove it in GitHub before retrying.`,
        undefined, true);
}

async function findExactIssue(
    http: SetupPermissionProbeHttp, owner: string, repository: string, title: string, root: string,
): Promise<IssueIdentity> {
    if (!/^[A-Za-z0-9_.-]{1,100}$/u.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/u.test(repository)) {
        throw new ProbeFailure('Temporary Issue recovery rejected an unsafe repository identity.', undefined, true);
    }
    const query = `repo:${owner}/${repository} is:issue in:title "${title}"`;
    const search = await probeJsonRecord(await http.expect(
        `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100`, 'GET', [200]));
    if (search.incomplete_results !== false || !Number.isSafeInteger(search.total_count)
        || (search.total_count as number) > 100 || !Array.isArray(search.items)) {
        throw new ProbeFailure('Temporary Issue recovery search was incomplete.', undefined, true);
    }
    const matches = search.items.filter(item => item && typeof item === 'object' && !Array.isArray(item)
        && (item as Record<string, unknown>).title === title
        && (item as Record<string, unknown>).repository_url === root
        && (item as Record<string, unknown>).pull_request === undefined);
    if (matches.length !== 1) {
        throw new ProbeFailure('Temporary Issue recovery could not find one exact Issue; no Issue was deleted.', undefined, true);
    }
    const match = matches[0] as Record<string, unknown>;
    if (!Number.isSafeInteger(match.number) || (match.number as number) <= 0
        || typeof match.node_id !== 'string' || !/^[A-Za-z0-9_=-]{8,128}$/u.test(match.node_id)) {
        throw new ProbeFailure('Temporary Issue recovery did not receive a safe Issue identity.', undefined, true);
    }
    return { number: match.number as number, nodeId: match.node_id };
}

function assertExactIssue(
    value: Record<string, unknown>, identity: IssueIdentity, title: string, root: string,
): void {
    if (value.number !== identity.number || value.node_id !== identity.nodeId
        || value.title !== title || value.repository_url !== root || value.pull_request !== undefined) {
        throw new ProbeFailure('Temporary Issue identity changed; automatic deletion stopped.', undefined, true);
    }
}
