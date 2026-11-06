import { expect, it } from 'vitest';
import { centerBinding } from '../../src/application/center_controller.ts';
import { CENTER_BINDING, centerFixture } from '../fixtures/center.ts';

it('elects one editor, restores the same native document and requires explicit observer takeover', () => {
    const h = centerFixture(); const editor = h.open(); const observerBinding = { documentId: 'two', tabId: 2 }; const observer = h.open(observerBinding);
    expect(editor.role).toBe('editor'); expect(observer.role).toBe('observer'); expect(h.open()).toEqual(editor);
    expect(h.controller.fence(observer.clientId)).toBe(null);
    const claimed = h.controller.claim(observer.clientId, observerBinding, observer.controllerEpoch);
    expect(claimed).toMatchObject({ role: 'editor', controllerEpoch: editor.controllerEpoch + 1 });
    expect(h.controller.claim(editor.clientId, CENTER_BINDING, editor.controllerEpoch)).toEqual({ state: 'stale' });
    expect(h.controller.fence(editor.clientId)).toBe(null);
    expect(h.controller.claim(observer.clientId, observerBinding, editor.controllerEpoch + 1)).toEqual(claimed);
    expect(h.controller.authorize(editor.clientId, CENTER_BINDING)?.role).toBe('observer');
});
it('binds client handles to native document/tab facts without reviving tab-only reloads or trusting missing metadata', () => {
    const h = centerFixture(); const editor = h.open();
    for (const binding of [{ ...CENTER_BINDING, documentId: 'foreign' }, { ...CENTER_BINDING, tabId: 3 }, { documentId: null, tabId: null }]) {
        expect(h.controller.authorize(editor.clientId, binding)).toBe(null);
        expect(h.controller.close(editor.clientId, binding, editor.controllerEpoch)).toEqual({ state: 'stale' });
    }
    expect(h.open({ documentId: null, tabId: 2 }).clientId).not.toBe(h.open({ documentId: null, tabId: 2 }).clientId);
    const options = h.open({ documentId: null, tabId: null });
    expect(h.controller.authorize(options.clientId, { documentId: null, tabId: null })?.role).toBe('observer');
    expect(centerBinding({})).toEqual({ documentId: null, tabId: null });
    expect(centerBinding({ documentId: 'native', tab: { id: 9 } })).toEqual({ documentId: 'native', tabId: 9 });
    expect(centerBinding({ tab: { id: 0 } })).toEqual({ documentId: null, tabId: 0 });
    for (const sender of [{ documentId: '' }, { documentId: 'x'.repeat(129) }, { documentId: 1 }, { tab: { id: -1 } }]) expect(centerBinding(sender as never)).toBe(null);
});
it('bounds open clients, rejects colliding/invalid authority IDs and recovers capacity after closure', () => {
    const h = centerFixture(); const editor = h.open(); h.ports.identifier.mockReturnValueOnce(editor.clientId).mockReturnValueOnce('not-random');
    expect(h.controller.open({ documentId: 'two', tabId: 2 })).toEqual({ state: 'unavailable' });
    expect(h.controller.open({ documentId: 'two', tabId: 2 })).toEqual({ state: 'unavailable' });
    h.ports.identifier.mockImplementationOnce(() => { throw new Error('private'); });
    expect(h.controller.open({ documentId: 'two', tabId: 2 })).toEqual({ state: 'unavailable' });
    for (let i = 2; i <= 8; i++) h.open({ documentId: String(i), tabId: i });
    expect(h.controller.open({ documentId: 'nine', tabId: 9 })).toEqual({ state: 'busy' });
    const observer = h.open({ documentId: '2', tabId: 2 });
    expect(h.controller.close(observer.clientId, { documentId: '2', tabId: 2 }, observer.controllerEpoch)).toEqual({ state: 'closed' });
    expect(h.open({ documentId: 'nine', tabId: 9 }).role).toBe('observer');
});
it('expires idle leases and refuses rewound clocks without a keepalive timer', () => {
    const h = centerFixture(); const editor = h.open(); h.advance(30 * 60_000);
    expect(h.controller.fence(editor.clientId)).toBe(null);
    const next = h.open(); expect(next.controllerEpoch).toBeGreaterThan(editor.controllerEpoch);
    h.advance(-1); expect(h.controller.authorize(next.clientId, CENTER_BINDING)).toBe(null);
    expect(h.open().clientId).not.toBe(next.clientId);
});
it('releases native tabs and shutdown synchronously, including the editor and observers', () => {
    const h = centerFixture(); const editor = h.open(); const observer = h.open({ documentId: 'two', tabId: 1 });
    h.controller.releaseTab(99); expect(h.controller.fence(editor.clientId)).not.toBe(null);
    h.controller.releaseTab(1); expect(h.controller.fence(editor.clientId)).toBe(null);
    expect(h.controller.authorize(observer.clientId, { documentId: 'two', tabId: 1 })).toBe(null);
    const next = h.open(); expect(h.controller.close(next.clientId, CENTER_BINDING, next.controllerEpoch)).toEqual({ state: 'closed' });
    const last = h.open(); h.controller.shutdown(); expect(h.controller.fence(last.clientId)).toBe(null);
});
it('an idle observer expires without displacing an editor that is still being used', () => {
    const h = centerFixture(); const editor = h.open(); const binding = { documentId: 'two', tabId: 2 }; const observer = h.open(binding);
    h.advance(29 * 60_000); expect(h.controller.authorize(editor.clientId, CENTER_BINDING)).toMatchObject({ role: 'editor' });
    h.advance(60_000); expect(h.controller.authorize(observer.clientId, binding)).toBe(null);
    expect(h.controller.fence(editor.clientId)).toEqual({ controllerEpoch: editor.controllerEpoch, credentialEpoch: 0 });
});
it('fails closed on revoked native permission, unsafe clocks/credential epochs and throwing environment ports', () => {
    const h = centerFixture(); const editor = h.open(); h.permit(false); expect(h.controller.fence(editor.clientId)).toBe(null);
    expect(h.controller.open(CENTER_BINDING)).toEqual({ state: 'unavailable' }); h.permit(true);
    for (const now of [NaN, -1, Number.MAX_SAFE_INTEGER]) { h.ports.now.mockReturnValueOnce(now); expect(h.controller.open(CENTER_BINDING)).toEqual({ state: 'unavailable' }); }
    h.ports.credentialEpoch.mockReturnValueOnce(-1); expect(h.controller.open(CENTER_BINDING)).toEqual({ state: 'unavailable' });
    h.open(); h.ports.now.mockImplementationOnce(() => { throw new Error('private'); }); expect(h.controller.fence(editor.clientId)).toBe(null);
    expect(h.controller.authorize('unknown', CENTER_BINDING)).toBe(null);
});
it('retains safe ownership when notification fails and fails closed at the numeric epoch boundary', () => {
    const h = centerFixture(); h.ports.changed.mockImplementationOnce(() => { throw new Error('private'); });
    expect(h.open().role).toBe('editor'); h.controller.shutdown();
    // Fault injection verifies the safe-integer guard without billions of foreground takeovers.
    Reflect.set(h.controller, 'epoch', Number.MAX_SAFE_INTEGER);
    expect(h.controller.open(CENTER_BINDING)).toEqual({ state: 'unavailable' });
    const other = centerFixture(); const editor = other.open(); const binding = { documentId: 'two', tabId: 2 }; const observer = other.open(binding);
    Reflect.set(other.controller, 'epoch', Number.MAX_SAFE_INTEGER);
    expect(other.controller.claim(observer.clientId, binding, Number.MAX_SAFE_INTEGER)).toEqual({ state: 'unavailable' });
    expect(other.controller.fence(editor.clientId)).toBe(null);
});
