import { randomBytes } from 'node:crypto';
import type { ResourceProbeContext } from './setup_permission_probe_context';
import { ProbeFailure, probeJsonRecord } from './setup_permission_probe_http';
import { withProbeCleanup } from './setup_permission_probe_transaction';

/** Creating an Issue, unlike a label, specifically requires Issues Write. */
export async function probeIssue(context: ResourceProbeContext): Promise<void> {
    const title = `Copilot permission test ${randomBytes(16).toString('hex')}`;
    const root = `https://api.github.com/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}`;
    context.phase('creating');
    await withProbeCleanup(context, title, async (owned, handle) => {
        const response = await context.http.expect(`${root}/issues`, 'POST', [201], {
            title,
            body: 'Temporary PAT permission verification. This Issue will be deleted if GitHub permits it; otherwise it will be closed and reported.',
        });
        owned();
        const created = await probeJsonRecord(response);
        const number = created.number;
        const nodeId = created.node_id;
        if (!Number.isSafeInteger(number) || (number as number) <= 0
            || typeof nodeId !== 'string' || !/^[A-Za-z0-9_=-]{8,128}$/u.test(nodeId)
            || created.title !== title || created.repository_url !== root || created.pull_request !== undefined) {
            throw new ProbeFailure('GitHub did not identify the exact temporary Issue for cleanup.');
        }
        await handle.setIssueIdentity(number as number, nodeId);
        context.phase('reading');
        const observed = await probeJsonRecord(await context.http.expect(`${root}/issues/${number}`, 'GET', [200]));
        if (observed.number !== number || observed.node_id !== nodeId
            || observed.title !== title || observed.repository_url !== root || observed.pull_request !== undefined) {
            throw new ProbeFailure('Temporary Issue readback did not match the created Issue.');
        }
    });
}
