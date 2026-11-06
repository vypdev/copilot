import { vi } from 'vitest';
import { PauseClient } from '../../src/application/pause_client.ts';
import type { PauseClientPorts } from '../../src/application/pause_client_ports.ts';
import { pauseReviewsFixture } from './temporary_pause_reviews.ts';

export function pauseClientFixture() {
    const native = pauseReviewsFixture(); let canRead = true; let canMutate = true; let now = 1000;
    const dispatch: PauseClientPorts['request'] = async input => {
        if (input.method === 'center.pauses.read') {
            const { loaded, precaution, pending } = await native.store.inspect();
            return { state: 'ready', loaded, precaution, pending, targets: { state: 'ready', tabs: [{ tabId: 7, label: 'octo/example · #42' }], limited: false } };
        }
        if (input.method === 'center.pauses.preview') return native.preview(input.intent, input.expectedRevision);
        if (input.method === 'center.pauses.confirm') return native.reviews.confirm(input.operationId, input.expectedRevision, native.owner.clientId);
        if (input.method === 'center.pauses.cancel') return native.reviews.cancel(input.operationId, input.expectedRevision, native.owner.clientId);
        return native.reviews.inspect(input.operationId, input.expectedRevision, native.owner.clientId);
    };
    const ports = { request: vi.fn(dispatch), canRead: vi.fn(() => canRead), canMutate: vi.fn(() => canMutate), now: vi.fn(() => now), changed: vi.fn() };
    const client = new PauseClient(ports); const listener = vi.fn(); client.subscribe(listener);
    return { native, ports, client, dispatch, listener, allowRead: (value: boolean) => { canRead = value; }, allowMutation: (value: boolean) => { canMutate = value; }, at: (value: number) => { now = value; } };
}
