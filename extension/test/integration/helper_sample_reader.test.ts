import { expect, it, vi } from 'vitest';
import { HelperSampleReader } from '../../src/application/helper_sample_reader.ts';
import { helperSamplesFixture } from '../fixtures/helper_samples.ts';
import { deferred } from '../fixtures/runtime.ts';

const sample = () => { const f = helperSamplesFixture(); f.owner.attach(f.capture(), 1); return f.owner.read(1); };
const fixture = () => { const ports = { request: vi.fn(async (): Promise<unknown> => sample()), eligible: vi.fn(() => true), changed: vi.fn() }; const reader = new HelperSampleReader(ports); return { reader, ports }; };
it('construction does no I/O and one explicit read returns only detached sample metadata', async () => {
    const f = fixture(); expect(f.ports.request).not.toHaveBeenCalled(); expect(f.reader.view).toEqual({ phase: 'idle', value: null }); await f.reader.read();
    expect(f.reader.view).toMatchObject({ phase: 'ready', value: { state: 'sample', capturedAt: 1000 } }); expect(Object.isFrozen(f.reader.view)).toBe(true); expect(f.ports.request).toHaveBeenCalledOnce();
});
it('duplicates join the one pending native request instead of queueing an unsolicited second read', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); const first = f.reader.read(); await Promise.resolve();
    expect(f.reader.read()).toBe(first); expect(f.reader.read()).toBe(first); expect(f.reader.view.phase).toBe('reading'); gate.resolve(sample()); await first; expect(f.ports.request).toHaveBeenCalledOnce();
});
it('invalidation coalesces one fresh request and rejects the earlier in-flight result', async () => {
    const f = fixture(); const first = deferred<unknown>(); const second = deferred<unknown>(); f.ports.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const pending = f.reader.read(); await Promise.resolve(); f.reader.invalidate(); f.reader.read(); f.reader.read(); first.resolve(sample());
    await vi.waitFor(() => expect(f.ports.request).toHaveBeenCalledTimes(2)); expect(f.reader.view.value).toBeNull(); second.resolve({ state: 'empty' }); await pending;
    expect(f.reader.view).toEqual({ phase: 'ready', value: { state: 'empty' } }); expect(f.ports.request).toHaveBeenCalledTimes(2);
});
it('hiding the page while a reply is pending drops the sample without polling or retry', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); const pending = f.reader.read(); await Promise.resolve();
    f.ports.eligible.mockReturnValue(false); gate.resolve(sample()); await pending; expect(f.reader.view).toEqual({ phase: 'idle', value: null }); expect(f.ports.request).toHaveBeenCalledOnce();
});
it.each(['hidden', 'throwing'] as const)('an %s eligibility source starts no request or inferred healthy sample', async state => {
    const f = fixture(); if (state === 'hidden') f.ports.eligible.mockReturnValue(false); else f.ports.eligible.mockImplementation(() => { throw new Error('private'); });
    await f.reader.read(); expect(f.ports.request).not.toHaveBeenCalled(); expect(f.reader.view.value).toBeNull();
});
it('failed native delivery exposes unavailable metadata without retaining a raw exception or retrying', async () => {
    const f = fixture(); f.ports.request.mockRejectedValueOnce(new Error('private')); await f.reader.read(); expect(f.reader.view).toEqual({ phase: 'unavailable', value: null }); expect(f.ports.request).toHaveBeenCalledOnce();
});
it.each([{ state: 'ready', health: {} }, { state: 'sample', secret: 'private' }, null])('malformed sample %j cannot become healthy evidence', async value => {
    const f = fixture(); f.ports.request.mockResolvedValueOnce(value); await f.reader.read(); expect(f.reader.view).toEqual({ phase: 'unavailable', value: null });
});
it.each(['empty', 'unavailable'] as const)('a valid native %s observation remains separate from transport failure', async state => {
    const f = fixture(); f.ports.request.mockResolvedValueOnce({ state }); await f.reader.read(); expect(f.reader.view).toEqual({ phase: 'ready', value: { state } });
});
it('shutdown drops an active reply and all future reads without publishing after disposal', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); const pending = f.reader.read(); await Promise.resolve(); f.reader.stop(); const notifications = f.ports.changed.mock.calls.length;
    gate.resolve(sample()); await pending; await f.reader.read(); f.reader.invalidate(); expect(f.reader.view).toEqual({ phase: 'idle', value: null }); expect(f.ports.changed).toHaveBeenCalledTimes(notifications); expect(f.ports.request).toHaveBeenCalledOnce();
});
it('a broken notification sink cannot reject a valid observation or request it again', async () => {
    const f = fixture(); f.ports.changed.mockImplementation(() => { throw new Error('secondary'); }); await expect(f.reader.read()).resolves.toBeUndefined(); expect(f.reader.view.phase).toBe('ready'); expect(f.ports.request).toHaveBeenCalledOnce();
});
it('eligibility that retires before the deferred native request prevents that request', async () => {
    const f = fixture(); f.ports.eligible.mockReturnValueOnce(true).mockReturnValueOnce(false); await f.reader.read(); expect(f.ports.request).not.toHaveBeenCalled(); expect(f.reader.view.phase).toBe('idle');
});
it('eligibility reentry cannot stop the reader and still publish an old response', async () => {
    const f = fixture(); f.ports.eligible.mockReturnValueOnce(true).mockReturnValueOnce(true).mockImplementationOnce(() => { f.reader.stop(); return true; }); await f.reader.read(); expect(f.reader.view.value).toBeNull();
});
it('invalidation inside post-response eligibility cannot publish the earlier generation', async () => {
    const f = fixture(); f.ports.eligible.mockReturnValueOnce(true).mockReturnValueOnce(true).mockImplementationOnce(() => { f.reader.invalidate(); return true; }); await f.reader.read(); expect(f.reader.view).toEqual({ phase: 'idle', value: null });
});
it('source retirement after decoding still prevents the copied sample from escaping', async () => {
    const f = fixture(); f.ports.eligible.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(false); await f.reader.read(); expect(f.reader.view.value).toBeNull(); expect(f.reader.view.phase).toBe('idle');
});
it('decoder accessors cannot invalidate the source and then publish their copied historical sample', async () => {
    const f = fixture(); const value = sample(); f.ports.request.mockResolvedValueOnce({ toJSON() { f.reader.invalidate(); return value; } }); await f.reader.read(); expect(f.reader.view.value).toBeNull();
});
it('preflight eligibility reentry into stop never starts a native read', async () => {
    const f = fixture(); f.ports.eligible.mockImplementation(() => { f.reader.stop(); return true; }); await f.reader.read(); expect(f.ports.request).not.toHaveBeenCalled();
});
it('a duplicate read reentered from the initial notification joins without recursive notifications or another request', async () => {
    const f = fixture(); f.ports.changed.mockImplementation(() => { if (f.reader.view.phase === 'reading' && f.ports.changed.mock.calls.length <= 3) void f.reader.read(); });
    await f.reader.read(); expect(f.ports.request).toHaveBeenCalledOnce(); expect(f.ports.changed).toHaveBeenCalledTimes(2);
});
it.each([true, false])('shutdown reentered from deferred eligibility returning %s cannot invoke native metadata', async result => {
    const f = fixture(); f.ports.eligible.mockReturnValueOnce(true).mockImplementationOnce(() => { f.reader.stop(); return result; }); await f.reader.read(); expect(f.ports.request).not.toHaveBeenCalled(); expect(f.reader.view.value).toBeNull();
});
it('shutdown during detached decoding cannot publish a completed sample after disposal', async () => {
    const f = fixture(); const value = sample(); f.ports.request.mockResolvedValueOnce({ toJSON() { f.reader.stop(); return value; } }); await f.reader.read(); expect(f.reader.view.value).toBeNull();
});
it.each([true, false])('shutdown from final eligibility returning %s cannot republish decoded metadata', async result => {
    const f = fixture(); f.ports.eligible.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(true).mockImplementationOnce(() => { f.reader.stop(); return result; });
    await f.reader.read(); expect(f.reader.view.value).toBeNull();
});
it('final source invalidation without shutdown still retires the decoded generation', async () => {
    const f = fixture(); f.ports.eligible.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(true).mockImplementationOnce(() => { f.reader.invalidate(); return true; });
    await f.reader.read(); expect(f.reader.view).toEqual({ phase: 'idle', value: null });
});
