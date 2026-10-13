import type { ApprovalObservationTarget } from '../../../application/ports/pull_request_approval_ports';

interface CurrentBaseRefQueryPort {
    getRef(parameters: { owner: string; repo: string; ref: string }): Promise<{
        data: { ref?: unknown; object?: { type?: unknown; sha?: unknown } | null };
    }>;
}

/** PR base metadata can lag a parent push; read the exact native branch ref. */
export async function readCurrentBaseRevision(
    port: CurrentBaseRefQueryPort,
    target: Pick<ApprovalObservationTarget, 'owner' | 'repository'>,
    baseRef: string,
): Promise<string> {
    if (typeof baseRef !== 'string' || baseRef.length === 0 || baseRef.length > 1_024
        || baseRef.includes('\u0000') || /[\r\n]/u.test(baseRef)) throw new Error('The PR base ref is invalid.');
    const { data } = await port.getRef({ owner: target.owner, repo: target.repository, ref: `heads/${baseRef}` });
    if (data?.ref !== `refs/heads/${baseRef}` || data.object?.type !== 'commit' || typeof data.object.sha !== 'string'
        || !/^[a-f0-9]{40}$/u.test(data.object.sha)) throw new Error('The PR base ref cannot be verified.');
    return data.object.sha;
}
