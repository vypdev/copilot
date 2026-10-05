import { randomBytes } from 'node:crypto';
import type { ResourceProbeContext } from './setup_permission_probe_context';
import { ProbeFailure, probeJsonRecord } from './setup_permission_probe_http';
import { withProbeCleanup } from './setup_permission_probe_transaction';

/** A draft PR with a one-file branch. It is closed, never merged. */
export async function probePullRequest(context: ResourceProbeContext): Promise<void> {
    const name = `copilot-permission-test-${randomBytes(16).toString('hex')}`;
    const root = `https://api.github.com/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}`;
    const metadata = await probeJsonRecord(await context.http.expect(root, 'GET', [200]));
    const base = metadata.default_branch;
    if (typeof base !== 'string' || !/^[A-Za-z0-9._/-]{1,255}$/u.test(base) || base.startsWith('/') || base.endsWith('/')) {
        throw new ProbeFailure('GitHub did not provide a safe base branch for the temporary pull request.');
    }
    const baseRef = await probeJsonRecord(await context.http.expect(
        `${root}/git/ref/heads/${encodeURIComponent(base)}`, 'GET', [200]));
    const object = baseRef.object;
    const sha = object && typeof object === 'object' && !Array.isArray(object)
        ? (object as Record<string, unknown>).sha : undefined;
    if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/u.test(sha)) {
        throw new ProbeFailure('GitHub did not provide a valid base commit for the temporary pull request.');
    }
    const ref = `${root}/git/ref/heads/${name}`;
    const prior = await context.http.request(ref);
    if (prior.status !== 404) throw new ProbeFailure(`Temporary branch absence was not confirmed (HTTP ${prior.status}).`, prior.status);
    context.phase('creating');
    await withProbeCleanup(context, name, async (owned, handle) => {
        await context.http.expect(`${root}/git/refs`, 'POST', [201], { ref: `refs/heads/${name}`, sha });
        owned();
        await context.http.expect(`${root}/contents/.copilot-permission-test/${name}.txt`, 'PUT', [201], {
            message: 'chore: verify temporary pull request access [skip ci]',
            content: Buffer.from('Temporary PAT permission test. This branch is removed automatically.\n', 'utf8').toString('base64'),
            branch: name,
        });
        const title = `Copilot permission test ${name.slice('copilot-permission-test-'.length)}`;
        await handle.markPullAttempted();
        const response = await context.http.request(`${root}/pulls`, 'POST', {
            title, head: name, base, draft: true,
            body: 'Temporary PAT permission check. This pull request is closed automatically.',
        });
        if (response.status !== 201) {
            if (response.status >= 400 && response.status < 500) await handle.clearRejectedPull();
            throw new ProbeFailure(`GitHub pull-request creation returned HTTP ${response.status}.`, response.status);
        }
        const created = await probeJsonRecord(response);
        const number = created.number;
        if (!Number.isSafeInteger(number) || (number as number) <= 0) {
            throw new ProbeFailure('GitHub did not identify the temporary pull request.');
        }
        context.phase('reading');
        const observed = await probeJsonRecord(await context.http.expect(`${root}/pulls/${number}`, 'GET', [200]));
        const head = observed.head;
        if (observed.number !== number || observed.title !== title || observed.state !== 'open'
            || !head || typeof head !== 'object' || Array.isArray(head)
            || (head as Record<string, unknown>).ref !== name) {
            throw new ProbeFailure('Temporary pull request readback did not match the created draft.');
        }
    });
}
