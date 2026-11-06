import { expect, it, vi } from 'vitest';
import { recentsGatewayFixture as fixture, activeRecents } from '../fixtures/recents_gateway.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import type { Sender } from '../../src/domain/protocol.ts';

it('the actual closed factory/channel captures and retains a destination without reading a provider or changing authored preferences', async () => {
    const f = await fixture(); const nativeReads = vi.mocked(f.journals.execute).mock.calls.length; const prefsReads = vi.mocked(f.port.get).mock.calls.length;
    const p = await f.capture(); expect(p).toMatchObject({ state: 'ready', epoch: 0, sequence: 0 }); expect(p.permit).toMatch(/^visit-[a-f0-9]{32}$/u);
    expect(f.journals.execute).toHaveBeenCalledTimes(nativeReads); expect(f.port.get).toHaveBeenCalledTimes(prefsReads);
    expect(await f.observe(p.permit!)).toEqual({ state: 'observed' }); await f.history.writer.flush();
    expect(f.documents.get('recents')).toMatchObject({ entries: [{ fact: { kind: 'destination', route: 'privacy' } }] }); expect(f.port.set).not.toHaveBeenCalled(); expect(f.sessions.reader.read).not.toHaveBeenCalled();
    expect(JSON.stringify(f.documents.get('recents'))).not.toContain(p.permit!);
});
it('off/unknown capture reads perform no history I/O, mint no permit and do not create a false retention gap', async () => {
    const f = await fixture(false); expect(await f.capture()).toMatchObject({ state: 'ready', permit: null, sequence: 0 });
    await f.history.refresh(); expect(await f.capture()).toMatchObject({ state: 'ready', permit: null });
    expect(f.journals.execute).not.toHaveBeenCalled(); expect(f.history.writer.state('recents').incomplete).toBe(false);
});
it('the native observer role may report its own opted-in visits but cannot steal another source permit', async () => {
    const f = await fixture(); const first = await f.capture(); const sender = { ...CENTER_SENDER, documentId: 'second-document', tab: { id: 2, incognito: false } };
    const observer = await f.open(sender); expect(await f.observe(first.permit!, 1, { route: 'privacy' }, observer, sender)).toEqual({ state: 'stale' });
    const own = await f.capture(observer, sender); expect(await f.observe(own.permit!, 1, { route: 'work' }, observer, sender)).toEqual({ state: 'observed' }); await f.history.writer.flush();
    expect(f.documents.get('recents')).toMatchObject({ entries: [{ fact: { route: 'work' } }] });
});
it.each(['document', 'tab', 'frame', 'origin', 'credential', 'controller'] as const)('a changed %s boundary cannot admit a native destination', async boundary => {
    const f = await fixture(); const p = await f.capture(); let source = f.owner; let sender: Sender = CENTER_SENDER;
    if (boundary === 'document') sender = { ...sender, documentId: 'replacement' };
    if (boundary === 'tab') sender = { ...sender, tab: { id: 9, incognito: false } };
    if (boundary === 'frame') sender = { ...sender, frameId: 1 };
    if (boundary === 'origin') sender = { ...sender, url: 'https://github.com/vypdev/copilot' };
    if (boundary === 'credential') source = { ...source, credentialEpoch: source.credentialEpoch + 1 };
    if (boundary === 'controller') source = { ...source, controllerEpoch: source.controllerEpoch + 1 };
    expect(await f.observe(p.permit!, 1, { route: 'privacy' }, source, sender)).not.toEqual({ state: 'observed' });
    await f.history.writer.flush(); expect(f.documents.get('recents')).toBeUndefined();
});
it('consent invalidation retires the actual issued permit even when the same healthy policy is observed again', async () => {
    const f = await fixture(); const before = await f.capture(); f.history.invalidate(); await f.history.refresh();
    expect(await f.observe(before.permit!)).toEqual({ state: 'stale' }); const current = await f.capture(); expect(current.permit).not.toBe(before.permit);
    expect(await f.observe(current.permit!)).toEqual({ state: 'observed' }); await f.history.writer.flush(); expect(f.history.writer.state('recents').incomplete).toBe(false);
});
it('native duplicate/reordered delivery cannot append twice or confuse observation sequence with journal row identity', async () => {
    const f = await fixture(); const p = await f.capture(); await f.observe(p.permit!, 4); await f.observe(p.permit!, 4); await f.history.writer.flush();
    expect(await f.observe(p.permit!, 4, { route: 'work' })).toEqual({ state: 'invalid' }); expect(await f.observe(p.permit!, 3)).toEqual({ state: 'stale' });
    expect(f.documents.get('recents')).toMatchObject({ nextSequence: 2, entries: [{ sequence: 1, fact: { route: 'privacy' } }] }); expect(await f.capture()).toMatchObject({ sequence: 4 });
});
it('clear invalidates both admission and generation; the old permit cannot be reused after a fresh opt-in', async () => {
    const f = await fixture(); const p = await f.capture(); await f.observe(p.permit!); await f.history.writer.flush();
    const stop = await f.call({ ...f.owner, method: 'center.collection.preview', kind: 'recents', action: 'stop' }) as { operationId: string };
    await f.call({ ...f.owner, method: 'center.collection.confirm', operationId: stop.operationId });
    const clear = await f.call({ ...f.owner, method: 'center.history.clear.preview', kind: 'recents' }) as { operationId: string };
    expect(await f.call({ ...f.owner, method: 'center.history.clear.confirm', operationId: clear.operationId })).toMatchObject({ state: 'observed-cleared', epoch: 1 });
    expect(await f.capture()).toMatchObject({ permit: null, epoch: 1 }); await activeRecents(f);
    expect(await f.observe(p.permit!, 2)).toEqual({ state: 'stale' }); expect(f.documents.get('recents')).toMatchObject({ epoch: 1, entries: [] });
});
