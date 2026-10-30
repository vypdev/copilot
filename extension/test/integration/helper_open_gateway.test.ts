import { afterEach, expect, it, vi } from 'vitest';
import { helperGatewayFixture, HELPER_SENDER } from '../fixtures/helper_gateway.ts';
import { deferred } from '../fixtures/runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

const fixtures: ReturnType<typeof helperGatewayFixture>[] = [];
const fixture = async () => { const f = helperGatewayFixture(); fixtures.push(f); expect(await f.configure()).toMatchObject({ state: 'ready' }); return f; };
afterEach(() => { for (const f of fixtures.splice(0)) f.gateway.shutdown(); });
it('native source validation captures before opening hides the page, without a provider or permission request', async () => {
    const f = await fixture(); const phases: string[] = []; const admit = f.sample.ports.admit.getMockImplementation()!;
    f.sample.ports.admit.mockImplementation((...args) => { phases.push('capture'); return admit(...args); });
    const open = f.ports.openSettings.getMockImplementation()!; f.ports.openSettings.mockImplementation(async (...args) => { phases.push('open'); f.gateway.invalidate(); return open(...args); });
    expect(await f.call(f.packet())).toEqual({ state: 'opened' }); expect(phases).toEqual(['capture', 'open']); expect(f.sample.owner.read(2)).toMatchObject({ state: 'sample', health: f.packet().health.health }); expect(f.reader.read).not.toHaveBeenCalled();
});
it('the packet is detached before current-tab await so caller mutation cannot replace the source ring', async () => {
    const f = await fixture(); const gate = deferred<Awaited<ReturnType<typeof f.ports.currentTab>>>(); f.ports.currentTab.mockReturnValueOnce(gate.promise);
    const input = f.packet(); const pending = f.call(input); input.health.health.events[0].code = 'refresh-failed'; input.health.health.blocked.splice(0);
    gate.resolve({ url: HELPER_SENDER.url, active: true, incognito: false, windowId: 1 }); await pending;
    expect(f.sample.owner.read(2)).toMatchObject({ state: 'sample', health: { blocked: ['runtime-health'], events: [{ code: 'mount-failed' }] } });
});
it.each(['sourceTree', 'generation', 'credentialEpoch', 'settingsRevision'] as const)('a mismatched %s source still opens the center but cannot supply a ready sample', async field => {
    const f = await fixture(); const input = f.packet(); Object.assign(input.health, { [field]: field === 'sourceTree' ? 'b'.repeat(64) : 99 });
    expect(await f.call(input)).toEqual({ state: 'opened' }); expect(f.sample.owner.read(2)).toEqual({ state: 'unavailable' }); expect(f.sample.ports.admit).not.toHaveBeenCalled();
});
it('a previous source receipt cannot be reused after a failed current configuration observation', async () => {
    const f = await fixture(); const input = f.packet(); f.values.set(SETTINGS_KEY, { schemaVersion: 99 }); expect(await f.configure()).toMatchObject({ state: 'unavailable' });
    expect(await f.call(input)).toEqual({ state: 'opened' }); expect(f.sample.owner.read(2)).toEqual({ state: 'unavailable' }); expect(f.sample.ports.admit).not.toHaveBeenCalled();
});
it('a pending replacement configuration observation temporarily withdraws the prior source receipt', async () => {
    const f = await fixture(); const input = f.packet(); const get = vi.mocked(f.port.get).getMockImplementation()!; const entered = deferred<void>(); const gate = deferred<void>();
    vi.mocked(f.port.get).mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; return get(...args); });
    const replacement = f.configure(); await entered.promise; expect(await f.call(input)).toEqual({ state: 'opened' }); expect(f.sample.owner.read(2)).toEqual({ state: 'unavailable' });
    gate.resolve(); await replacement;
});
it.each(['missing', 'document', 'invalidated', 'credential'] as const)('an %s native lease cannot authenticate a ready sample', async boundary => {
    const f = boundary === 'missing' ? helperGatewayFixture() : await fixture(); if (boundary === 'missing') fixtures.push(f); const input = f.packet();
    if (boundary === 'invalidated') f.gateway.invalidate(1);
    if (boundary === 'credential') await f.service.revoke();
    expect(await f.call(input, boundary === 'document' ? { ...HELPER_SENDER, documentId: 'new-document' } : HELPER_SENDER)).toEqual({ state: 'opened' });
    expect(f.sample.owner.read(2)).toEqual({ state: 'unavailable' }); expect(f.sample.ports.admit).not.toHaveBeenCalled();
});
it('a newly admitted native document at the same route gets its own source receipt', async () => {
    const f = await fixture(); const sender = { ...HELPER_SENDER, documentId: 'replacement-document' }; expect(await f.configure(sender)).toMatchObject({ state: 'ready' });
    expect(await f.call(f.packet(), sender)).toEqual({ state: 'opened' }); expect(f.sample.owner.read(2).state).toBe('sample');
});
it('a legacy open has no fabricated healthy sample or secondary recording call', async () => {
    const f = await fixture(); expect(await f.call({ version: 1, method: 'settings.open' })).toEqual({ state: 'opened' }); expect(f.sample.owner.read(2)).toEqual({ state: 'empty' });
    expect(f.ports.openSettings).toHaveBeenCalledExactlyOnceWith(1); expect(f.sample.ports.admit).not.toHaveBeenCalled();
});
it.each(['foreign', 'frame', 'private', 'extension'] as const)('a %s sender cannot add a source sample or open a target window', async kind => {
    const f = await fixture(); f.ports.currentTab.mockClear();
    const sender = kind === 'foreign' ? { ...HELPER_SENDER, id: 'other' } : kind === 'frame' ? { ...HELPER_SENDER, frameId: 1 }
        : kind === 'private' ? { ...HELPER_SENDER, tab: { ...HELPER_SENDER.tab, incognito: true } } : { ...HELPER_SENDER, url: 'chrome-extension://test/runtime.html' };
    expect(await f.call(f.packet(), sender)).toEqual({ state: 'rejected' }); expect(f.ports.currentTab).not.toHaveBeenCalled(); expect(f.sample.ports.admit).not.toHaveBeenCalled();
});
it('retirement while native tab lookup is pending prevents primary open and diagnostic admission', async () => {
    const f = await fixture(); const gate = deferred<Awaited<ReturnType<typeof f.ports.currentTab>>>(); f.ports.currentTab.mockReturnValueOnce(gate.promise);
    const pending = f.call(f.packet()); f.gateway.invalidate(1); gate.resolve({ url: HELPER_SENDER.url, active: true, incognito: false, windowId: 1 });
    expect(await pending).toEqual({ state: 'stale' }); expect(f.ports.openSettings).not.toHaveBeenCalled(); expect(f.sample.ports.admit).not.toHaveBeenCalled();
});
it('secondary capture and source-build query failures cannot prevent an otherwise valid native open', async () => {
    const f = await fixture(); vi.spyOn(f.sample.owner, 'capture').mockImplementationOnce(() => { throw new Error('private'); }); expect(await f.call(f.packet())).toEqual({ state: 'opened' });
    f.ports.sourceTree.mockImplementation(() => { throw new Error('private'); }); expect(await f.call(f.packet())).toEqual({ state: 'opened' }); expect(f.sample.owner.read(2)).toEqual({ state: 'unavailable' });
});
it('native tab removal during open retires the unbound receipt instead of attaching it to an uncertain created identifier', async () => {
    const f = await fixture(); const open = f.ports.openSettings.getMockImplementation()!; f.ports.openSettings.mockImplementationOnce(async (...args) => { f.gateway.releaseHelperTab(99); return open(...args); });
    expect(await f.call(f.packet())).toEqual({ state: 'opened' }); expect(f.sample.owner.read(2)).toEqual({ state: 'empty' });
});
it('an explicitly unavailable originating source opens with unavailable evidence rather than a zero-fault result', async () => {
    const f = await fixture(); expect(await f.call({ version: 1, method: 'settings.open', health: { state: 'unavailable', sourceTree: f.sample.source.sourceTree } })).toEqual({ state: 'opened' });
    expect(f.sample.owner.read(2)).toEqual({ state: 'unavailable' }); expect(f.sample.ports.admit).not.toHaveBeenCalled();
});
it('malformed or expanded sample packets are rejected before native lookup or journal admission', async () => {
    const f = await fixture(); f.ports.currentTab.mockClear();
    for (const health of [{ ...f.packet().health, secret: 'private' }, { ...f.packet().health, health: { blocked: [], events: [{ code: 'raw-error' }] } }, null]) expect(await f.call({ ...f.packet(), health })).toEqual({ state: 'rejected' });
    expect(f.ports.currentTab).not.toHaveBeenCalled(); expect(f.ports.openSettings).not.toHaveBeenCalled(); expect(f.sample.ports.admit).not.toHaveBeenCalled();
});
it('a pending native inspection withdraws the prior source receipt before any asynchronous configuration boundary', async () => {
    const f = await fixture(); const input = f.packet(); const gate = deferred<Awaited<ReturnType<typeof f.ports.currentTab>>>(); const entered = deferred<void>();
    f.ports.currentTab.mockImplementationOnce(() => { entered.resolve(); return gate.promise; }); const pending = f.configure(); await entered.promise;
    expect(await f.call(input)).toEqual({ state: 'opened' }); expect(f.sample.owner.read(2)).toEqual({ state: 'unavailable' });
    gate.resolve({ url: HELPER_SENDER.url, incognito: false, active: true, windowId: 1 }); await pending;
});
it('an older final native observation cannot restore a source receipt after a newer configuration observation failed', async () => {
    const f = await fixture(); const input = f.packet(); const gate = deferred<Awaited<ReturnType<typeof f.ports.currentTab>>>(); const entered = deferred<void>();
    f.ports.currentTab.mockResolvedValueOnce({ url: HELPER_SENDER.url, incognito: false, active: true, windowId: 1 }).mockImplementationOnce(() => { entered.resolve(); return gate.promise; });
    const older = f.configure(); await entered.promise; f.values.set(SETTINGS_KEY, { schemaVersion: 99 }); expect(await f.configure()).toMatchObject({ state: 'unavailable' });
    gate.resolve({ url: HELPER_SENDER.url, incognito: false, active: true, windowId: 1 }); await older;
    await f.call(input); expect(f.sample.owner.read(2)).toEqual({ state: 'unavailable' }); expect(f.sample.ports.admit).not.toHaveBeenCalled();
});
it.each(['retirement', 'shutdown'] as const)('secondary %s reentry before the primary effect cannot open a retired native source', async event => {
    const f = await fixture(); f.sample.ports.admit.mockImplementationOnce(() => { if (event === 'shutdown') f.gateway.shutdown(); else f.gateway.invalidate(1); return null; });
    expect(await f.call(f.packet())).toEqual({ state: 'stale' }); expect(f.ports.openSettings).not.toHaveBeenCalled();
});
it('an embedding without the optional helper producer still opens a valid sampled request through the legacy primary route', async () => {
    const f = await fixture(); const { MessageGateway } = await import('../../src/application/message_gateway.ts');
    const legacy = new MessageGateway('test', 'chrome-extension://test/', f.settings, f.service, f.ports);
    try { expect(await legacy.handle(f.packet(), HELPER_SENDER)).toEqual({ state: 'opened' }); expect(f.ports.openSettings).toHaveBeenCalledExactlyOnceWith(1); }
    finally { legacy.shutdown(); }
});
it('retirement during the first native configuration query cannot read preferences or restore the reserved source lease', async () => {
    const f = helperGatewayFixture(); fixtures.push(f); const gate = deferred<Awaited<ReturnType<typeof f.ports.currentTab>>>(); f.ports.currentTab.mockReturnValueOnce(gate.promise);
    const pending = f.configure(); f.gateway.invalidate(1); gate.resolve({ url: HELPER_SENDER.url, active: true, incognito: false, windowId: 1 });
    expect(await pending).toEqual({ state: 'stale' }); expect(f.port.get).not.toHaveBeenCalled(); expect(f.reader.read).not.toHaveBeenCalled();
});
