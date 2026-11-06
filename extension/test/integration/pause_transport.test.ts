import { expect, it, vi } from 'vitest';
import { requestPauseContext } from '../../src/application/center_request_context.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { CenterIdentity } from '../../src/domain/center_reply.ts';
import type { PauseRequest } from '../../src/domain/pause_request.ts';

const owner: CenterIdentity = { role: 'editor', clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 2 };
const read: PauseRequest = { method: 'center.pauses.read' };
const preview: PauseRequest = { method: 'center.pauses.preview', intent: { type: 'emergency', paused: true }, expectedRevision: 0 };
it.each([null, owner])('stopped or missing native ownership cannot issue a pause request: %j', identity => {
    const send = vi.fn(); return expect(requestPauseContext(read, identity, true, false, send, () => identity)).resolves.toEqual({ state: 'stale' }).then(() => expect(send).not.toHaveBeenCalled());
});
it('unknown ownership fails closed before transport even when the view is otherwise live', async () => {
    const send = vi.fn(); expect(await requestPauseContext(read, null, false, false, send, () => null)).toEqual({ state: 'stale' }); expect(send).not.toHaveBeenCalled();
});
it('native read exposes only a client header while preview adds controller and credential epochs privately', async () => {
    const send = vi.fn(async () => ({ state: 'ready' })); await requestPauseContext(read, owner, false, false, send, () => owner);
    expect(send).toHaveBeenLastCalledWith({ ...read, version: 1, clientId: owner.clientId });
    await requestPauseContext(preview, owner, false, false, send, () => owner); expect(send).toHaveBeenLastCalledWith({ ...preview, version: 1, clientId: owner.clientId, controllerEpoch: 1, credentialEpoch: 2 });
});
it('observers may inspect native state but cannot even request another window’s retained result', async () => {
    const observer = { ...owner, role: 'observer' } as const; const send = vi.fn(async () => ({ state: 'ready' }));
    expect(await requestPauseContext(preview, observer, false, false, send, () => observer)).toEqual({ state: 'denied' });
    expect(await requestPauseContext({ method: 'center.pauses.result', operationId: 'b'.repeat(32), expectedRevision: 0 }, observer, false, false, send, () => observer)).toEqual({ state: 'denied' });
    await requestPauseContext(read, observer, false, false, send, () => observer); expect(send).toHaveBeenCalledOnce();
});
it('an actual settings mutation blocks native effects but permits independent reading and exact-result inspection', async () => {
    const send = vi.fn(async () => ({ state: 'pending' })); expect(await requestPauseContext(preview, owner, false, true, send, () => owner)).toEqual({ state: 'busy' });
    await requestPauseContext(read, owner, false, true, send, () => owner); await requestPauseContext({ method: 'center.pauses.result', operationId: 'b'.repeat(32), expectedRevision: 0 }, owner, false, true, send, () => owner);
    expect(send).toHaveBeenCalledTimes(2);
});
it.each(['clientId', 'controllerEpoch', 'credentialEpoch', 'role', 'closed'] as const)('the post-await %s fence rejects a late reply from the old native owner', async field => {
    const gate = deferred<Record<string, unknown>>(); let current: CenterIdentity | null = owner;
    const pending = requestPauseContext(read, owner, false, false, () => gate.promise, () => current);
    current = field === 'closed' ? null : { ...owner, [field]: field === 'role' ? 'observer' : field === 'clientId' ? 'c'.repeat(32) : 9 };
    gate.resolve({ state: 'ready', precaution: false }); expect(await pending).toEqual({ state: 'stale' });
});
it('a delayed preferences read cannot prevent privately authenticated native safety work', async () => {
    const h = centerClientFixture(); const send = h.port.send.getMockImplementation()!; const gate = deferred<unknown>();
    h.port.send.mockImplementation(message => message.method === 'center.read' ? gate.promise : message.method === 'center.pauses.read' ? Promise.resolve({ state: 'native-only', sourceTree: h.port.sourceTree }) : send(message));
    const opening = h.client.start(); await vi.waitFor(() => expect(h.client.view.role).toBe('editor')); expect(h.client.view.phase).toBe('loading');
    expect(await h.client.requestPauses(read)).toEqual({ state: 'native-only' }); h.client.stop(); gate.resolve(null); await opening;
});
it('an observer may claim control during an older delayed preferences read and publishes editor identity before the next read finishes', async () => {
    const h = centerClientFixture(); h.native.open({ documentId: 'other-owner', tabId: 8 }); const send = h.port.send.getMockImplementation()!;
    const first = deferred<unknown>(); const second = deferred<unknown>(); let reads = 0;
    h.port.send.mockImplementation(message => message.method === 'center.read' ? (++reads === 1 ? first.promise : second.promise) : send(message));
    const opening = h.client.start(); await vi.waitFor(() => expect(h.client.view.role).toBe('observer'));
    const claim = h.client.takeControl(); await vi.waitFor(() => expect(h.client.view.role).toBe('editor')); expect(reads).toBe(2);
    first.resolve(null); await opening; expect(h.client.view.role).toBe('editor'); expect(h.client.view.phase).toBe('reading');
    h.client.stop(); second.resolve(null); await claim;
});
it('repeated control takeover while a native claim is suspended cannot send another claim or orphan its identity', async () => {
    const h = centerClientFixture(); h.native.open({ documentId: 'other-owner', tabId: 8 }); const send = h.port.send.getMockImplementation()!;
    const readGate = deferred<unknown>(); const claimGate = deferred<unknown>();
    h.port.send.mockImplementation(message => message.method === 'center.read' ? readGate.promise : message.method === 'center.claim' ? claimGate.promise : send(message));
    const opening = h.client.start(); await vi.waitFor(() => expect(h.client.view.role).toBe('observer')); const first = h.client.takeControl(); const duplicate = h.client.takeControl();
    try { expect(h.port.send.mock.calls.filter(([input]) => input.method === 'center.claim')).toHaveLength(1); }
    finally { h.client.stop(); readGate.resolve(null); claimGate.resolve(null); await Promise.all([opening, first, duplicate]); }
});
