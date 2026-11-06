import { expect, it, vi } from 'vitest';
import { PauseReader } from '../../src/application/pause_reader.ts';
import { pauseControlWire } from '../fixtures/pause_wire.ts';
import { deferred } from '../fixtures/runtime.ts';

function fixture() {
    let allowed = true; const ports = { request: vi.fn(async () => pauseControlWire() as unknown), changed: vi.fn(), canRead: vi.fn(() => allowed) };
    const reader = new PauseReader(ports); return { reader, ports, allow: (value: boolean) => { allowed = value; } };
}
it('one read produces immutable metadata without submitting any effect', async () => {
    const h = fixture(); await h.reader.read(); expect(h.reader.view).toMatchObject({ phase: 'ready', current: true, data: pauseControlWire() });
    expect(h.ports.request).toHaveBeenCalledExactlyOnceWith({ method: 'center.pauses.read' }); expect(Object.isFrozen(h.reader.view)).toBe(true);
});
it('repeated requests before the owned drain starts coalesce into a single native metadata read', async () => {
    const h = fixture(); const first = h.reader.read(); expect(h.reader.read()).toBe(first); expect(h.reader.read()).toBe(first); await first; expect(h.ports.request).toHaveBeenCalledOnce();
});
it('a pending read has only one coalesced trailing request and never overlaps its native requests', async () => {
    const h = fixture(); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise); const first = h.reader.read();
    await vi.waitFor(() => expect(h.ports.request).toHaveBeenCalledOnce()); for (let i = 0; i < 50; i++) h.reader.read(); expect(h.ports.request).toHaveBeenCalledOnce();
    gate.resolve(pauseControlWire()); await first; expect(h.ports.request).toHaveBeenCalledTimes(2);
});
it('native invalidation drops a suspended result and one fresh trailing read establishes current data', async () => {
    const h = fixture(); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise); const first = h.reader.read();
    await vi.waitFor(() => expect(h.ports.request).toHaveBeenCalled()); h.reader.invalidate(); h.reader.read();
    gate.resolve({ ...pauseControlWire(), precaution: true }); await first; expect(h.reader.view).toMatchObject({ phase: 'ready', current: true, data: { precaution: false } }); expect(h.ports.request).toHaveBeenCalledTimes(2);
});
it('a renderer that retires the generation before the native call cannot leak an obsolete request', async () => {
    const h = fixture(); h.ports.changed.mockImplementationOnce(() => h.reader.invalidate()); await h.reader.read(); expect(h.ports.request).not.toHaveBeenCalled(); expect(h.reader.view.phase).toBe('stale');
});
it('source eligibility lost at delivery clears metadata without presenting a stale native label', async () => {
    const h = fixture(); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise); const pending = h.reader.read();
    await vi.waitFor(() => expect(h.ports.request).toHaveBeenCalled()); h.allow(false); gate.resolve(pauseControlWire()); await pending;
    expect(h.reader.view).toEqual({ phase: 'stale', current: false, data: null });
});
it.each(['hidden', 'throw'] as const)('an initially %s read scope cannot query the browser or reuse earlier data', async kind => {
    const h = fixture(); await h.reader.read(); h.ports.request.mockClear(); if (kind === 'hidden') h.allow(false); else h.ports.canRead.mockImplementation(() => { throw new Error('scope unavailable'); });
    await h.reader.read(); expect(h.ports.request).not.toHaveBeenCalled(); expect(h.reader.view).toEqual({ phase: 'stale', current: false, data: null });
});
it('eligibility loss during reading notification prevents even the first native metadata request', async () => {
    const h = fixture(); h.ports.changed.mockImplementationOnce(() => h.allow(false)); await h.reader.read(); expect(h.ports.request).not.toHaveBeenCalled();
});
it.each(['malformed', 'rejected'] as const)('%s metadata cannot become an empty or resumed state', async kind => {
    const h = fixture(); if (kind === 'malformed') h.ports.request.mockResolvedValue(null); else h.ports.request.mockRejectedValue(new Error('private source'));
    await h.reader.read(); expect(h.reader.view).toEqual({ phase: 'unavailable', current: false, data: null }); expect(JSON.stringify(h.reader.view)).not.toContain('private source');
});
it('a canonical revision anchor rejects rollback without substituting an invented native state', async () => {
    const h = fixture(); h.reader.anchor(2); await h.reader.read(); expect(h.reader.view.phase).toBe('unavailable');
    const value = pauseControlWire(); if (value.loaded.state !== 'ready') throw new Error('fixture'); h.ports.request.mockResolvedValue({ ...value, loaded: { state: 'ready', value: { ...value.loaded.value, revision: 2 } } });
    await h.reader.read(); expect(h.reader.view.current).toBe(true); h.reader.anchor(1); h.reader.anchor(-1); await h.reader.read(); expect(h.reader.view.current).toBe(true);
});
it('a new native client context can observe a reset browser-session document without accepting rollback in the old context', async () => {
    const h = fixture(); h.reader.anchor(3); h.reader.invalidate(true); await h.reader.read(); expect(h.reader.view).toMatchObject({ phase: 'ready', current: true });
});
it.each(['future', 'corrupt', 'unavailable'] as const)('%s native storage is explicit data availability, never a successful resumption', async state => {
    const h = fixture(); h.ports.request.mockResolvedValue({ ...pauseControlWire(), loaded: { state } }); await h.reader.read();
    expect(h.reader.view).toMatchObject({ phase: 'ready', current: true, data: { loaded: { state } } });
});
it('a throwing renderer cannot change the successfully decoded native facts', async () => {
    const h = fixture(); h.ports.changed.mockImplementation(() => { throw new Error('renderer'); }); await h.reader.read(); expect(h.reader.view.current).toBe(true);
});
it('stop fences pending reads, clears labels and prevents later native requests', async () => {
    const h = fixture(); const gate = deferred<unknown>(); h.ports.request.mockReturnValueOnce(gate.promise); const pending = h.reader.read();
    await vi.waitFor(() => expect(h.ports.request).toHaveBeenCalled()); h.reader.stop(); gate.resolve(pauseControlWire()); await pending;
    const calls = h.ports.request.mock.calls.length; await h.reader.read(); h.reader.invalidate(); expect(h.ports.request).toHaveBeenCalledTimes(calls); expect(h.reader.view).toEqual({ phase: 'idle', current: false, data: null });
});
it('stop from the reading notification cannot start or publish any native request', async () => {
    const h = fixture(); h.ports.changed.mockImplementationOnce(() => h.reader.stop()); await h.reader.read(); expect(h.ports.request).not.toHaveBeenCalled(); expect(h.reader.view.phase).toBe('idle');
});
