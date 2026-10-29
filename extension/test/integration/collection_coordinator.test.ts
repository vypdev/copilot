import { expect, it, vi } from 'vitest';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/domain/settings.ts';
import { collectionFixture, collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { deferred } from '../fixtures/runtime.ts';

it('starts inert and observes default-off preferences independently from known empty policies', async () => {
    const f = collectionFixture(); expect(f.coordinator.admission('diagnostics')).toBeNull();
    expect(f.policies.execute).not.toHaveBeenCalled(); expect(f.ports.settings).not.toHaveBeenCalled();
    await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'off', globallyPaused: false,
        policy: 'paused', policyRevision: 0, collecting: false, sessionBlocked: false, busy: false });
    expect(f.coordinator.pausedPolicyRevision('diagnostics')).toBe(0);
});
it('restores only healthy already-active consent after an ordinary owner restart, without writing policy', async () => {
    const f = collectionFixture(collectionSettings(true, true)); f.values.set('diagnostics', activeCollectionPolicy()); f.values.set('recents', activeCollectionPolicy('recents'));
    await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics').collecting).toBe(true); expect(f.coordinator.admission('recents')?.current()).toBe(true);
    expect(f.coordinator.pausedPolicyRevision('diagnostics')).toBeNull(); expect(f.events).toEqual(['diagnostics:read', 'recents:read']);
    expect(Object.isFrozen(f.coordinator.state('diagnostics'))).toBe(true);
});
it.each(['future', 'corrupt', 'unavailable'] as const)('keeps %s policy inert while still showing the saved preference', async state => {
    const f = collectionFixture(collectionSettings(true)); vi.mocked(f.policies.execute).mockResolvedValue(state === 'unavailable'
        ? { state, effect: 'not-started' } : { state });
    await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'on', policy: state, collecting: false });
});
it('does not admit work under an active policy whose counter can no longer advance to stop', async () => {
    const f = collectionFixture(collectionSettings(true)); const active = activeCollectionPolicy(); const maximum = Number.MAX_SAFE_INTEGER;
    f.values.set('diagnostics', { ...active, revision: maximum, receipt: { ...active.receipt!, beforeRevision: maximum - 1 } });
    await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics').policy).toBe('active'); expect(f.coordinator.admission('diagnostics')).toBeNull();
});
it.each(['invalid', 'future', 'migrated', 'throws'])('does not default %s preferences into capture authority', async state => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy());
    if (state === 'throws') f.ports.settings.mockRejectedValue(new Error('native'));
    else f.ports.settings.mockResolvedValue(state === 'migrated' ? loadSettings({ schemaVersion: 0, compact: true })
        : { state: state as 'invalid' | 'future', settings: DEFAULT_SETTINGS, migrated: false });
    await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'unknown', globallyPaused: null, collecting: false });
});
it('does not let an older settings/policy read replace a newer verified observation', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const gate = deferred<ReturnType<typeof loadSettings>>();
    f.ports.settings.mockReturnValueOnce(gate.promise); const old = f.coordinator.refresh(); await Promise.resolve();
    f.values.delete('diagnostics'); const latest = f.coordinator.refresh();
    gate.resolve(loadSettings(collectionSettings(true))); await latest; await old; expect(f.coordinator.state('diagnostics').policy).toBe('paused');
});
it('invalidates cached admission immediately and discards a read already in flight', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh();
    const ticket = f.coordinator.admission('diagnostics')!; const gate = deferred<ReturnType<typeof loadSettings>>();
    f.ports.settings.mockReturnValueOnce(gate.promise); const old = f.coordinator.refresh(); await Promise.resolve(); f.coordinator.invalidate();
    expect(ticket.current()).toBe(false); gate.resolve(loadSettings(collectionSettings(true))); await old;
    expect(f.coordinator.state('diagnostics').preference).toBe('unknown');
});
it('does not notify unchanged observations or let a center notification error change collection facts', async () => {
    const f = collectionFixture(); f.ports.changed.mockImplementation(() => { throw new Error('no-center'); });
    await f.coordinator.refresh(); expect(f.ports.changed).toHaveBeenCalledTimes(1); await f.coordinator.refresh(); expect(f.ports.changed).toHaveBeenCalledTimes(1);
});
it('retires an admission when the current policy revision changes even if it remains active', async () => {
    const f = collectionFixture(collectionSettings(true)); const active = activeCollectionPolicy(); f.values.set('diagnostics', active); await f.coordinator.refresh();
    const ticket = f.coordinator.admission('diagnostics')!;
    f.values.set('diagnostics', { ...active, revision: 2, receipt: { ...active.receipt!, beforeRevision: 1 } }); await f.coordinator.refresh();
    expect(ticket.current()).toBe(false); expect(f.coordinator.admission('diagnostics')?.policyRevision).toBe(2);
});
it('requires known exact off preferences, paused policy, an idle writer and no preference work to reserve clear', async () => {
    const f = collectionFixture(); expect(f.coordinator.reserve('diagnostics', 0, 0)).toBeNull(); await f.coordinator.refresh();
    expect(f.coordinator.reserve('diagnostics', 1, 0)).toBeNull(); expect(f.coordinator.reserve('diagnostics', 0, 1)).toBeNull();
    f.ports.writerIdle.mockReturnValueOnce(false); expect(f.coordinator.reserve('diagnostics', 0, 0)).toBeNull();
    f.ports.writerIdle.mockImplementationOnce(() => { throw new Error('writer'); }); expect(f.coordinator.reserve('diagnostics', 0, 0)).toBeNull();
    const held = f.coordinator.reserve('diagnostics', 0, 0)!; expect(held.current()).toBe(true); expect(f.coordinator.reserve('diagnostics', 0, 0)).toBeNull();
    held.release(); expect(held.current()).toBe(false); const next = f.coordinator.reserve('diagnostics', 0, 0)!;
    held.release(); expect(next.current()).toBe(true); next.release();
});
it('refuses a clear reservation while preferences remain opted in, even if policy is paused', async () => {
    const f = collectionFixture(collectionSettings(true)); await f.coordinator.refresh(); expect(f.coordinator.reserve('diagnostics', 0, 0)).toBeNull();
});
it('retires a clear lease when either exact policy or canonical preference revision moves', async () => {
    const f = collectionFixture(); await f.coordinator.refresh(); const held = f.coordinator.reserve('diagnostics', 0, 0)!;
    f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh(); expect(held.current()).toBe(false); held.release();
    f.values.delete('diagnostics'); await f.coordinator.refresh(); const next = f.coordinator.reserve('diagnostics', 0, 0)!;
    await f.port.set(SETTINGS_KEY, collectionSettings(false, false, 1)); await f.coordinator.refresh(); expect(next.current()).toBe(false); next.release();
});
it('does not accept a disposed owner or an old in-flight observation, but still permits a restrictive preference save', async () => {
    const f = collectionFixture(); await f.coordinator.refresh(); const held = f.coordinator.reserve('diagnostics', 0, 0)!;
    const gate = deferred<ReturnType<typeof loadSettings>>(); f.ports.settings.mockReturnValueOnce(gate.promise); const old = f.coordinator.refresh(); await Promise.resolve(); f.coordinator.dispose();
    gate.resolve(loadSettings(collectionSettings(true))); await old; const reads = f.ports.settings.mock.calls.length;
    await f.coordinator.refresh(); expect(f.ports.settings).toHaveBeenCalledTimes(reads); expect(held.current()).toBe(false);
    expect(f.coordinator.idle('recents')).toBe(false); expect((await f.coordinator.prepare(DEFAULT_SETTINGS, collectionSettings(true), () => true)).allowed).toBe(false);
    const off = await f.coordinator.prepare(collectionSettings(true), DEFAULT_SETTINGS, () => true); expect(off.allowed).toBe(true); off.release(); held.release();
});
it('coalesces a burst into one current read and one latest trailing read without dropping requested facts', async () => {
    const f = collectionFixture(); const gate = deferred<ReturnType<typeof loadSettings>>(); f.ports.settings.mockReturnValueOnce(gate.promise);
    const first = f.coordinator.refresh(); await Promise.resolve();
    const burst = Array.from({ length: 100 }, () => f.coordinator.refresh()); expect(f.ports.settings).toHaveBeenCalledTimes(1);
    f.values.set('diagnostics', activeCollectionPolicy()); await f.port.set(SETTINGS_KEY, collectionSettings(true));
    gate.resolve(loadSettings(DEFAULT_SETTINGS)); await Promise.all([first, ...burst]);
    expect(f.ports.settings).toHaveBeenCalledTimes(2); expect(f.policies.execute).toHaveBeenCalledTimes(4);
    expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'on', policy: 'active', collecting: true });
});
it('a synchronous reentrant refresh joins the existing finite read pump', async () => {
    const f = collectionFixture(); f.ports.settings.mockImplementationOnce(() => {
        void f.coordinator.refresh(); return Promise.resolve(loadSettings(DEFAULT_SETTINGS));
    });
    await f.coordinator.refresh(); expect(f.ports.settings).toHaveBeenCalledTimes(2); expect(f.coordinator.state('recents').policy).toBe('paused');
});
it('disposal before a scheduled refresh begins performs no native reads', async () => {
    const f = collectionFixture(); const pending = f.coordinator.refresh(); f.coordinator.dispose(); await pending;
    expect(f.ports.settings).not.toHaveBeenCalled(); expect(f.policies.execute).not.toHaveBeenCalled();
});
