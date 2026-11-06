import { expect, it, vi } from 'vitest';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { CONNECTION_INPUT, namedSessionsFixture } from '../fixtures/named_sessions.ts';
import { deferred } from '../fixtures/runtime.ts';

it('blocks a new connection from restoring credentials while revoke-all is draining native storage', async () => {
    const h = namedSessionsFixture();
    const entered = deferred<void>(); const release = deferred<void>(); const attempted = deferred<void>();
    const remove = vi.mocked(h.port.remove).getMockImplementation()!;
    vi.mocked(h.port.remove).mockImplementation(async key => {
        if (key === NAMED_SESSIONS_KEY) { entered.resolve(); await release.promise; }
        await remove(key);
    });
    h.namedPorts.connected.mockImplementationOnce(async () => { attempted.resolve(); });
    const previousSource = h.connections.capturePreferenceSource();
    const cleanup = h.connections.revokeAll(); await entered.promise;
    const revokingSource = h.connections.capturePreferenceSource();
    const sourceWasAvailable = revokingSource();
    const mutation = h.connections.change(CONNECTION_INPUT, 0, h.current);
    await Promise.race([mutation, attempted.promise]);
    release.resolve(); await cleanup;
    expect(await mutation).toEqual({ state: 'conflict' });
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.values.has(SESSION_KEY)).toBe(false);
    expect(h.reader.read).not.toHaveBeenCalled();
    expect(previousSource()).toBe(false); expect(sourceWasAvailable).toBe(false); expect(revokingSource()).toBe(false);
    expect(await h.connections.change(CONNECTION_INPUT, 0, h.current)).toMatchObject({ state: 'ready', connected: true });
});
it('keeps new connections blocked until both overlapping removals have settled', async () => {
    const h = namedSessionsFixture();
    const first = { entered: deferred<void>(), release: deferred<void>() };
    const second = { entered: deferred<void>(), release: deferred<void>() };
    const attempts = [first, second].values();
    const remove = vi.mocked(h.port.remove).getMockImplementation()!;
    vi.mocked(h.port.remove).mockImplementation(async key => {
        if (key === NAMED_SESSIONS_KEY) {
            const gate = attempts.next().value!;
            gate.entered.resolve(); await gate.release.promise;
        }
        await remove(key);
    });
    const firstCleanup = h.connections.revokeAll(); await first.entered.promise;
    const secondCleanup = h.connections.revokeAll();
    first.release.resolve(); await firstCleanup; await second.entered.promise;
    const mutation = h.connections.change(CONNECTION_INPUT, 0, h.current);
    second.release.resolve(); await secondCleanup;
    expect(await mutation).toEqual({ state: 'conflict' });
    expect(h.reader.read).not.toHaveBeenCalled();
    expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.values.has(SESSION_KEY)).toBe(false);
    expect(h.connections.capturePreferenceSource()()).toBe(true);
});
it('retains the removal reservation while vault deletion drains after active revocation fails', async () => {
    const h = namedSessionsFixture();
    const entered = deferred<void>(); const release = deferred<void>();
    const remove = vi.mocked(h.port.remove).getMockImplementation()!;
    vi.mocked(h.port.remove).mockImplementationOnce(async key => { entered.resolve(); await release.promise; await remove(key); });
    vi.spyOn(h.ports, 'cancellation').mockImplementationOnce(() => { throw new Error('private cancellation failure'); });
    const forgetting = h.connections.change({ type: 'revoke-all' }, 0, h.current); await entered.promise;
    expect(await h.connections.change(CONNECTION_INPUT, 0, h.current)).toEqual({ state: 'conflict' });
    release.resolve(); expect(await forgetting).toEqual({ state: 'unavailable' });
    expect(h.reader.read).not.toHaveBeenCalled();
    expect(await h.connections.change(CONNECTION_INPUT, 0, h.current)).toMatchObject({ state: 'ready', connected: true });
});
