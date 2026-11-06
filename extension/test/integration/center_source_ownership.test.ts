import { expect, it } from 'vitest';
import { CENTER_BINDING, centerFixture } from '../fixtures/center.ts';

const binding = (source: Readonly<object> = {}) => ({ ...CENTER_BINDING, source });
it('native source identity isolates clients with identical document and tab metadata', () => {
    const h = centerFixture(); const first = h.open(binding()); const second = h.open(binding());
    expect(first.role).toBe('editor'); expect(second.role).toBe('observer'); expect(second.clientId).not.toBe(first.clientId);
});
it('native source reuses its client idempotently even when both optional native facts are missing', () => {
    const h = centerFixture(); const source = { source: {} }; const bound = { documentId: null, tabId: null, ...source };
    const first = h.open(bound); expect(h.open(bound)).toEqual(first); expect(h.ports.changed).toHaveBeenCalledOnce();
});
it('native sources with no optional native facts cannot share or impersonate clients', () => {
    const h = centerFixture(); const first = h.open({ documentId: null, tabId: null, source: {} });
    expect(h.controller.authorize(first.clientId, { documentId: null, tabId: null, source: {} })).toBeNull();
});
it('legacy direct messages cannot authorize a native-port client despite identical native facts', () => {
    const h = centerFixture(); const owner = h.open(binding());
    expect(h.controller.authorize(owner.clientId, CENTER_BINDING)).toBeNull();
    expect(h.controller.claim(owner.clientId, CENTER_BINDING, owner.controllerEpoch)).toEqual({ state: 'stale' });
});
it('another source cannot close or claim a stolen native client handle', () => {
    const h = centerFixture(); const own = binding(); const foreign = binding(); const owner = h.open(own);
    expect(h.controller.close(owner.clientId, foreign, owner.controllerEpoch)).toEqual({ state: 'stale' });
    expect(h.controller.claim(owner.clientId, foreign, owner.controllerEpoch)).toEqual({ state: 'stale' });
    expect(h.controller.fence(owner.clientId)).not.toBeNull();
});
it('source retirement synchronously fences a retained preference preview before confirmation', async () => {
    const h = centerFixture(); const own = binding(); const owner = h.open(own);
    const preview = await h.operations.preview({ type: 'preferences', values: { locale: 'es' } }, owner.clientId, 0);
    expect(preview.state).toBe('preview'); if (preview.state !== 'preview') throw new Error('fixture-preview');
    h.controller.releaseSource(own.source);
    expect(await h.operations.confirm(preview.operationId, preview.revision, owner.clientId)).toMatchObject({ state: 'expired' });
    expect(h.port.set).not.toHaveBeenCalled();
});
it('retiring an observer leaves the active editor and its fence untouched', () => {
    const h = centerFixture(); const editor = h.open(binding()); const observed = binding(); h.open(observed);
    h.controller.releaseSource(observed.source); expect(h.controller.fence(editor.clientId)).toEqual({ controllerEpoch: editor.controllerEpoch, credentialEpoch: 0 });
    expect(h.ports.changed).toHaveBeenCalledOnce();
});
it('late repeated old-source retirement cannot revoke the replacement document editor', () => {
    const h = centerFixture(); const old = binding(); h.open(old); h.controller.releaseSource(old.source);
    const next = h.open(binding()); h.controller.releaseSource(old.source);
    expect(h.controller.fence(next.clientId)).toEqual({ controllerEpoch: next.controllerEpoch, credentialEpoch: 0 });
});
it('legacy loading retirement removes only legacy clients and leaves the native editor active', () => {
    const h = centerFixture(); const owner = h.open(binding()); const legacy = h.open();
    h.controller.releaseTab(1, true); expect(h.controller.fence(owner.clientId)).not.toBeNull();
    expect(h.controller.authorize(legacy.clientId, CENTER_BINDING)).toBeNull();
});
it('native tab removal retires every port source and legacy client in that tab', () => {
    const h = centerFixture(); const first = binding(); const second = binding(); const owner = h.open(first); const other = h.open(second); const legacy = h.open();
    h.controller.releaseTab(1); expect(h.controller.authorize(owner.clientId, first)).toBeNull();
    expect(h.controller.authorize(other.clientId, second)).toBeNull(); expect(h.controller.authorize(legacy.clientId, CENTER_BINDING)).toBeNull();
});
it('native tab removal preserves a separate window source with its own native tab', () => {
    const h = centerFixture(); const first = binding(); const owner = h.open(first); const otherBinding = { ...binding(), tabId: 2 }; const other = h.open(otherBinding);
    h.controller.releaseTab(1); expect(h.controller.fence(owner.clientId)).toBeNull();
    expect(h.controller.authorize(other.clientId, otherBinding)?.role).toBe('observer');
});
it('a taken-over source cannot use its former epoch and its late disconnect does not revoke the new editor', () => {
    const h = centerFixture(); const first = binding(); const editor = h.open(first); const second = binding(); const observer = h.open(second);
    const claimed = h.controller.claim(observer.clientId, second, observer.controllerEpoch); expect(claimed).toMatchObject({ role: 'editor' });
    h.controller.releaseSource(first.source); expect(h.controller.fence(observer.clientId)).not.toBeNull();
    expect(h.controller.authorize(editor.clientId, first, editor.controllerEpoch)).toBeNull();
});
it('same source cannot reuse a handle if trusted native document facts differ', () => {
    const h = centerFixture(); const own = binding(); const editor = h.open(own); const changed = { ...own, documentId: 'replacement-document' };
    expect(h.controller.authorize(editor.clientId, changed)).toBeNull(); expect(h.open(changed).clientId).not.toBe(editor.clientId);
});
it('same source cannot reuse a handle if trusted native tab facts differ', () => {
    const h = centerFixture(); const own = binding(); const editor = h.open(own); const changed = { ...own, tabId: 2 };
    expect(h.controller.authorize(editor.clientId, changed)).toBeNull(); expect(h.open(changed).clientId).not.toBe(editor.clientId);
});
it('a source cannot revive an expired idle handle even while its native connection still exists', () => {
    const h = centerFixture(); const own = binding(); const editor = h.open(own); h.advance(30 * 60_000);
    expect(h.controller.authorize(editor.clientId, own)).toBeNull(); expect(h.open(own).clientId).not.toBe(editor.clientId);
});
it('worker shutdown retires every native source without persisting a capability', () => {
    const h = centerFixture(); const own = binding(); const editor = h.open(own); h.controller.shutdown();
    expect(h.controller.authorize(editor.clientId, own)).toBeNull(); expect(h.values.size).toBe(0);
});
