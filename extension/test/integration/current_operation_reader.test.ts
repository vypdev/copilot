import { expect, it } from 'vitest';
import { currentReaderFixture as fixture, CURRENT_REPLY } from '../fixtures/current_operation_reader.ts';
import { deferred } from '../fixtures/runtime.ts';

it('constructs inertly and publishes only detached, frozen source-checked current replies', async () => {
    const f = fixture(); expect(f.ports.request).not.toHaveBeenCalled(); const reply = { ...CURRENT_REPLY, operation: { ...CURRENT_REPLY.operation, target: { ...CURRENT_REPLY.operation.target } } }; f.ports.request.mockResolvedValueOnce(reply);
    await f.reader.read(); expect(f.reader.view).toMatchObject({ phase: 'ready', current: true, value: CURRENT_REPLY }); expect(Object.isFrozen(f.reader.view)).toBe(true);
    reply.operation.target.label = 'Changed'; expect(JSON.stringify(f.reader.view)).not.toContain('Changed');
});
it('invalidation immediately retires private target detail while keeping previously proved completion facts', async () => {
    const f = fixture(); f.ports.request.mockResolvedValueOnce({ ...CURRENT_REPLY, operation: { ...CURRENT_REPLY.operation, stage: 'settled', fact: { ...CURRENT_REPLY.operation.fact, phase: 'settled', acknowledgement: 'accepted', observation: 'committed' } } });
    await f.reader.read(); f.reader.invalidate(); expect(f.reader.view).toMatchObject({ phase: 'idle', current: false, value: { operation: { target: null, sourceCurrent: false, fact: { observation: 'committed' } } } });
});
it('failed or malformed reads never promote old private targets or erase an earlier canonical fact', async () => {
    const f = fixture(); await f.reader.read(); f.ports.request.mockRejectedValueOnce(new Error('private')); await f.reader.read();
    expect(f.reader.view).toMatchObject({ phase: 'unavailable', current: false, value: { operation: { target: null } } });
    f.ports.request.mockResolvedValueOnce({ ...CURRENT_REPLY, owner: 'secret' }); await f.reader.read(); expect(f.reader.view.phase).toBe('unavailable');
});
it('a read burst has one active metadata call and one coalesced trailing observation', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); const first = f.reader.read(); await Promise.resolve();
    for (let i = 0; i < 8; i++) void f.reader.read(); expect(f.ports.request).toHaveBeenCalledOnce(); gate.resolve(CURRENT_REPLY); await first;
    expect(f.ports.request).toHaveBeenCalledTimes(2);
});
it('an old reply cannot restore targets after a source invalidation or overwrite the requested replacement', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); const first = f.reader.read(); await Promise.resolve();
    f.reader.clear(); f.ports.request.mockResolvedValueOnce({ state: 'empty' }); void f.reader.read(); gate.resolve(CURRENT_REPLY); await first;
    expect(f.reader.view).toEqual({ phase: 'ready', current: true, value: { state: 'empty' } }); expect(f.ports.request).toHaveBeenCalledTimes(2);
});
it('becoming hidden while awaiting a reply cannot publish a private target or trigger a background refresh', async () => {
    const f = fixture(); const gate = deferred<unknown>(); f.ports.request.mockReturnValueOnce(gate.promise); const first = f.reader.read(); await Promise.resolve();
    f.ports.eligible.mockReturnValue(false); gate.resolve(CURRENT_REPLY); await first; expect(f.reader.view.current).toBe(false); expect(f.reader.view.value).toBeNull();
    await f.reader.read(); expect(f.ports.request).toHaveBeenCalledOnce();
});
it('eligibility lost before the scheduled request prevents native metadata I/O', async () => {
    const f = fixture(); const first = f.reader.read(); f.ports.eligible.mockReturnValue(false); await first;
    expect(f.ports.request).not.toHaveBeenCalled(); expect(f.reader.view.phase).toBe('idle');
});
it('disposal while queued or awaiting a response prevents any later publication or private state', async () => {
    const f = fixture(); const first = f.reader.read(); f.reader.stop(); await first; expect(f.ports.request).not.toHaveBeenCalled();
    const other = fixture(); const gate = deferred<unknown>(); other.ports.request.mockReturnValueOnce(gate.promise); const active = other.reader.read(); await Promise.resolve();
    other.reader.stop(); const count = other.ports.changed.mock.calls.length; gate.resolve(CURRENT_REPLY); await active; await other.reader.read(); other.reader.clear(); other.reader.invalidate();
    expect(other.reader.view.value).toBeNull(); expect(other.ports.changed).toHaveBeenCalledTimes(count);
});
it('a throwing renderer or eligibility callback cannot poison the reader or primary application', async () => {
    const f = fixture(); f.ports.changed.mockImplementation(() => { throw new Error('private'); }); await f.reader.read(); expect(f.reader.view.current).toBe(true);
    f.ports.eligible.mockImplementation(() => { throw new Error('private'); }); await f.reader.read(); expect(f.reader.view.current).toBe(false);
});
it('reentrant disposal at either eligibility gate does not start a request or alter stopped state', async () => {
    const f = fixture(); f.ports.eligible.mockImplementationOnce(() => { f.reader.stop(); return true; }); await f.reader.read(); expect(f.ports.request).not.toHaveBeenCalled(); expect(f.reader.view.phase).toBe('idle');
    const other = fixture(); const active = other.reader.read(); other.ports.eligible.mockImplementationOnce(() => { other.reader.stop(); return true; }); await active; expect(other.ports.request).not.toHaveBeenCalled();
});
it('untrusted reply serialization cannot reenter invalidation and then restore the old private target', async () => {
    const f = fixture(); f.ports.request.mockResolvedValueOnce({ toJSON() { f.reader.clear(); return CURRENT_REPLY; } }); await f.reader.read(); expect(f.reader.view.value).toBeNull();
});
it('untrusted reply serialization cannot publish private detail after disposal or newly lost eligibility', async () => {
    const f = fixture(); f.ports.request.mockResolvedValueOnce({ toJSON() { f.reader.stop(); return CURRENT_REPLY; } }); await f.reader.read(); expect(f.reader.view.value).toBeNull();
    const other = fixture(); other.ports.request.mockResolvedValueOnce({ toJSON() { other.ports.eligible.mockReturnValue(false); return CURRENT_REPLY; } }); await other.reader.read(); expect(other.reader.view.value).toBeNull();
});
it.each(['stop', 'clear'] as const)('scope retirement via %s in the final source check cannot restore private state', async retire => {
    const f = fixture(); f.ports.request.mockResolvedValueOnce({ toJSON() {
        f.ports.eligible.mockImplementation(() => { f.reader[retire](); return true; }); return CURRENT_REPLY;
    } }); await f.reader.read(); expect(f.reader.view.value).toBeNull();
});
it('disposal during the first response source check cannot retain or publish the received private target', async () => {
    const f = fixture(); f.ports.request.mockImplementationOnce(async () => {
        f.ports.eligible.mockImplementationOnce(() => { f.reader.stop(); return true; }); return CURRENT_REPLY;
    }); await f.reader.read(); expect(f.reader.view.value).toBeNull(); expect(f.reader.view.phase).toBe('idle');
});
