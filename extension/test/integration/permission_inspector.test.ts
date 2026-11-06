import { expect, it, vi } from 'vitest';
import { PermissionInspector, type PermissionInspectionPorts } from '../../src/application/permission_inspector.ts';
import type { PermissionGrant, PermissionInspection } from '../../src/domain/permission_inspection.ts';
import { deferred } from '../fixtures/runtime.ts';

function fixture() {
    const deadlines: (() => void)[] = []; const cancel = vi.fn();
    const ports = { query: vi.fn<PermissionInspectionPorts['query']>(async () => 'granted'),
        after: vi.fn<PermissionInspectionPorts['after']>((milliseconds, action) => { expect(milliseconds).toBe(5000); deadlines.push(action); return cancel; }),
        changed: vi.fn<(view: PermissionInspection) => void>() };
    const reader = new PermissionInspector(ports); return { reader, ports, deadlines, cancel };
}
const ready = async (h: ReturnType<typeof fixture>) => vi.waitFor(() => expect(h.reader.view.phase).toBe('ready'));
it('collects one immutable three-scope observation and never converts denied or unknown states to grants', async () => {
    const h = fixture(); h.ports.query.mockResolvedValueOnce('granted').mockResolvedValueOnce('not-granted').mockResolvedValueOnce('unknown');
    h.reader.read(); expect(h.reader.view.phase).toBe('checking'); await ready(h);
    expect(h.reader.view.grants).toEqual({ 'local-storage': 'granted', 'github-pages': 'not-granted', 'github-api': 'unknown' });
    expect(Object.isFrozen(h.reader.view.grants)).toBe(true); expect(h.cancel).toHaveBeenCalledOnce();
});
it('coalesces repeated explicit requests into one follow-up without overlapping native batches', async () => {
    const h = fixture(); const wait = deferred<PermissionGrant>(); h.ports.query.mockImplementation(() => wait.promise);
    h.reader.read(); h.reader.read(); h.reader.read(); expect(h.ports.query).toHaveBeenCalledTimes(3);
    wait.resolve('granted'); await vi.waitFor(() => expect(h.ports.query).toHaveBeenCalledTimes(6)); await ready(h);
});
it('retires observations before an await and ignores late grants from the prior context', async () => {
    const h = fixture(); const wait = deferred<PermissionGrant>(); h.ports.query.mockImplementation(() => wait.promise);
    h.reader.read(); h.reader.invalidate(); expect(Object.values(h.reader.view.grants)).toEqual(['unknown', 'unknown', 'unknown']);
    wait.resolve('granted'); await vi.waitFor(() => expect(h.reader.view.pending).toBe(false)); expect(h.reader.view.phase).toBe('idle');
});
it('an explicit request after invalidation starts one fresh observation only after the retired native batch settles', async () => {
    const h = fixture(); const wait = deferred<PermissionGrant>();
    h.ports.query.mockImplementationOnce(() => wait.promise); h.reader.read(); h.reader.invalidate(); h.reader.read();
    expect(h.ports.query).toHaveBeenCalledTimes(3); wait.resolve('granted'); await ready(h); expect(h.ports.query).toHaveBeenCalledTimes(6);
});
it('a five-second timeout stays unknown and late native results cannot become granted facts', async () => {
    const h = fixture(); const wait = deferred<PermissionGrant>(); h.ports.query.mockImplementation(() => wait.promise);
    h.reader.read(); h.deadlines[0](); expect(h.reader.view).toMatchObject({ phase: 'timed-out', pending: true });
    wait.resolve('granted'); await vi.waitFor(() => expect(h.reader.view.pending).toBe(false));
    expect(h.reader.view.phase).toBe('timed-out'); expect(Object.values(h.reader.view.grants)).toEqual(['unknown', 'unknown', 'unknown']);
});
it('a canceled deadline already queued by the native event loop cannot change a newer context', async () => {
    const h = fixture(); const wait = deferred<PermissionGrant>(); h.ports.query.mockImplementation(() => wait.promise);
    h.reader.read(); h.reader.invalidate(); h.deadlines[0](); expect(h.reader.view.phase).toBe('idle'); wait.resolve('granted');
    await vi.waitFor(() => expect(h.reader.view.pending).toBe(false)); expect(h.reader.view.phase).toBe('idle');
});
it('a canceled timeout callback already queued after completion cannot replace a valid observed result', async () => {
    const h = fixture(); h.reader.read(); await ready(h); h.deadlines[0]();
    expect(h.reader.view).toMatchObject({ phase: 'ready', pending: false, grants: { 'github-api': 'granted' } });
});
it('closing the owner cancels its deadline and all later completions and requests stay silent', async () => {
    const h = fixture(); const wait = deferred<PermissionGrant>(); h.ports.query.mockImplementation(() => wait.promise);
    h.reader.read(); h.reader.stop(); const calls = h.ports.changed.mock.calls.length; h.reader.read(); h.reader.invalidate(); h.reader.stop();
    wait.resolve('granted'); await vi.waitFor(() => expect(h.cancel).toHaveBeenCalled()); expect(h.ports.changed).toHaveBeenCalledTimes(calls);
});
it('a query failure is unknown and never starts a failure retry loop', async () => {
    const h = fixture(); h.ports.query.mockRejectedValue(new Error('private-native-error')); h.reader.read(); await ready(h);
    expect(Object.values(h.reader.view.grants)).toEqual(['unknown', 'unknown', 'unknown']); expect(h.ports.query).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(h.reader.view)).not.toContain('private-native-error');
});
it('an unavailable deadline scheduler fails closed before starting any native query', () => {
    const h = fixture(); h.ports.after.mockImplementation(() => { throw new Error('closed-native-window'); }); h.reader.read();
    expect(h.reader.view.phase).toBe('idle'); expect(h.reader.view.pending).toBe(false); expect(h.ports.query).not.toHaveBeenCalled();
});
it('a renderer exception cannot corrupt a completed native observation', async () => {
    const h = fixture(); h.ports.changed.mockImplementation(() => { throw new Error('renderer'); }); h.reader.read(); await ready(h);
    expect(h.reader.view.grants['github-api']).toBe('granted');
});
it('synchronous owner disposal on the checking notification prevents timers and native calls', () => {
    const h = fixture(); h.ports.changed.mockImplementation(() => h.reader.stop()); h.reader.read();
    expect(h.ports.after).not.toHaveBeenCalled(); expect(h.ports.query).not.toHaveBeenCalled(); expect(h.reader.view.phase).toBe('idle');
});
it('synchronous invalidation before a query begins leaves no fictitious pending operation', () => {
    const h = fixture(); h.ports.changed.mockImplementation(view => { if (view.phase === 'checking') h.reader.invalidate(); });
    h.reader.read(); expect(h.reader.view).toMatchObject({ phase: 'idle', pending: false });
    expect(h.ports.after).not.toHaveBeenCalled(); expect(h.ports.query).not.toHaveBeenCalled();
});
it('an owner invalidated while a result is rendered cannot receive the old queued follow-up', async () => {
    const h = fixture(); const wait = deferred<PermissionGrant>(); h.ports.query.mockImplementation(() => wait.promise);
    h.ports.changed.mockImplementation(view => { if (view.phase === 'ready') h.reader.invalidate(); });
    h.reader.read(); h.reader.read(); wait.resolve('granted'); await vi.waitFor(() => expect(h.reader.view.pending).toBe(false));
    expect(h.reader.view.phase).toBe('idle'); expect(h.ports.query).toHaveBeenCalledTimes(3);
});
it('a new explicit read from a completed observation does not duplicate an older coalesced request', async () => {
    const h = fixture(); const wait = deferred<PermissionGrant>(); let once = false;
    h.ports.query.mockImplementationOnce(() => wait.promise); h.ports.changed.mockImplementation(view => {
        if (view.phase === 'ready' && !once) { once = true; h.reader.read(); }
    });
    h.reader.read(); h.reader.read(); wait.resolve('granted'); await ready(h); expect(h.ports.query).toHaveBeenCalledTimes(6);
});
