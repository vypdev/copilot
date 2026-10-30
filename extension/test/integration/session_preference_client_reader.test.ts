import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { sessionPreferenceReplyFixture } from '../fixtures/session_preference_reply.ts';
import { SessionPreferenceClientReader } from '../../src/application/session_preference_client_reader.ts';
import { deferred } from '../fixtures/runtime.ts';

let native: Awaited<ReturnType<typeof sessionPreferenceReplyFixture>>;
beforeAll(async () => { native = await sessionPreferenceReplyFixture(); });
afterAll(() => { native?.stop(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function fixture() {
    const request = vi.fn(async () => native.read); let allowed = true; const changed = vi.fn();
    const reader = new SessionPreferenceClientReader({ request, canRead: () => allowed, changed }); return { reader, request, changed, deny: () => { allowed = false; } };
}
it('the typed metadata reader uses only its parameterless native read and never supplies an operation selector or authority', async () => {
    const h = fixture(); await h.reader.read(); expect(h.reader.view).toMatchObject({ phase: 'ready', current: true, data: { loaded: { state: 'ready' } } });
    expect(h.request).toHaveBeenCalledExactlyOnceWith({ method: 'center.session-preferences.read' }); h.reader.stop(); expect(h.reader.view).toMatchObject({ phase: 'idle', data: null });
});
it('concurrent refresh hints join one request and one trailing observation without a metadata polling loop', async () => {
    const h = fixture(); const gate = deferred<unknown>(); h.request.mockReturnValueOnce(gate.promise as Promise<Record<string, unknown>>);
    const first = h.reader.read(); await vi.waitFor(() => expect(h.request).toHaveBeenCalledOnce()); const others = Array.from({ length: 20 }, () => h.reader.read());
    gate.resolve(native.read); await Promise.all([first, ...others]); expect(h.request).toHaveBeenCalledTimes(2); expect(h.reader.view.current).toBe(true); h.reader.stop();
});
it('retired, denied and below-anchor metadata cannot restore stale preferences or substitute an empty usable document', async () => {
    const h = fixture(); h.reader.anchor(1); await h.reader.read(); expect(h.reader.view).toMatchObject({ phase: 'unavailable', current: false, data: null });
    h.reader.invalidate(true); await h.reader.read(); expect(h.reader.view.current).toBe(true);
    const gate = deferred<unknown>(); h.request.mockReturnValueOnce(gate.promise as Promise<Record<string, unknown>>); const reading = h.reader.read(); await vi.waitFor(() => expect(h.reader.view.phase).toBe('reading'));
    h.reader.invalidate(); gate.resolve(native.read); await reading; expect(h.reader.view).toMatchObject({ phase: 'stale', current: false, data: null });
    h.deny(); await h.reader.read(); expect(h.reader.view.current).toBe(false); h.reader.stop();
});
