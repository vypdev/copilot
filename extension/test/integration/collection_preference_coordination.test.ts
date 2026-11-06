import { expect, it, vi } from 'vitest';
import { CollectionCoordinator } from '../../src/application/collection_coordinator.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/domain/settings.ts';
import { collectionFixture, collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { deferred } from '../fixtures/runtime.ts';

const ID = 'd'.repeat(32);
it('pauses admission synchronously before awaiting any native consent read during stop', async () => {
    const f = collectionFixture(collectionSettings(true, true)); f.values.set('diagnostics', activeCollectionPolicy()); f.values.set('recents', activeCollectionPolicy('recents'));
    await f.coordinator.refresh(); const ticket = f.coordinator.admission('recents')!; const gate = deferred<never>();
    vi.mocked(f.policies.execute).mockReturnValueOnce(gate.promise);
    const prepared = f.coordinator.prepare(collectionSettings(true, true), DEFAULT_SETTINGS, () => true);
    expect(ticket.current()).toBe(false); expect(f.coordinator.admission('diagnostics')).toBeNull(); expect(f.coordinator.state('recents').sessionBlocked).toBe(true);
    gate.resolve({ state: 'unavailable', effect: 'not-started' } as never); (await prepared).release();
});
it('attempts and canonically observes policy pause before saving preference off, preserving retained history scope', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh(); f.events.length = 0;
    expect((await f.repository.commit(DEFAULT_SETTINGS, 0, ID, () => true)).state).toBe('committed'); await f.coordinator.refresh();
    expect(f.events.slice(0, 4)).toEqual(['diagnostics:read', 'diagnostics:set', 'diagnostics:read', 'preferences:set']);
    expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'off', policy: 'paused', collecting: false,
        restriction: { acknowledgement: 'accepted', observation: 'paused' } });
    expect([...f.values.keys()]).toEqual(['diagnostics']);
});
it('saves off even when policy persistence fails and never resumes that sticky stop from ordinary reads', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation((...args) => args[1].type === 'set' ? Promise.resolve({ state: 'unavailable', effect: 'aborted' }) : execute(...args));
    await f.coordinator.refresh(); expect((await f.repository.commit(DEFAULT_SETTINGS, 0, ID, () => true)).state).toBe('committed'); await f.coordinator.refresh();
    expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'off', policy: 'active', collecting: false, sessionBlocked: true });
    await f.port.set(SETTINGS_KEY, collectionSettings(true, false, 2)); await f.coordinator.refresh(); expect(f.coordinator.admission('diagnostics')).toBeNull();
});
it('does not claim a durable stop if neither native restriction can persist', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation((...args) => args[1].type === 'set' ? Promise.resolve({ state: 'unavailable', effect: 'unknown' }) : execute(...args));
    vi.mocked(f.port.set).mockRejectedValueOnce(new Error('storage')); await f.coordinator.refresh();
    expect((await f.repository.commit(DEFAULT_SETTINGS, 0, ID, () => true)).state).toBe('unknown'); await f.coordinator.refresh();
    expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'on', policy: 'active', sessionBlocked: true, collecting: false,
        restriction: { acknowledgement: 'unknown', observation: 'active' } });
    const restarted = new CollectionCoordinator(f.policies, f.ports); await restarted.refresh(); expect(restarted.state('diagnostics').collecting).toBe(true);
});
it('does not reuse an old active marker when a generic preference import enables capture', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh();
    expect((await f.repository.update(() => collectionSettings(true))).center.diagnostics).toBe(true); await f.coordinator.refresh();
    expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'on', policy: 'paused', sessionBlocked: true, collecting: false });
    expect(f.coordinator.admission('diagnostics')).toBeNull();
});
it('refuses an opt-in increase if the required paused policy cannot be observed', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation((...args) => args[1].type === 'set' ? Promise.resolve({ state: 'conflict' }) : execute(...args));
    expect(await f.repository.commit(collectionSettings(true), 0, ID, () => true)).toEqual({ state: 'unavailable' }); expect(f.port.set).not.toHaveBeenCalled();
    await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics').preference).toBe('off');
});
it('continues both restriction attempts when a mixed preference change cannot enable one kind', async () => {
    const f = collectionFixture(collectionSettings(false, true)); f.values.set('diagnostics', { schemaVersion: 99 }); f.values.set('recents', activeCollectionPolicy('recents'));
    expect((await f.repository.commit(collectionSettings(true, false), 0, ID, () => true)).state).toBe('unavailable'); await f.coordinator.refresh();
    expect(f.coordinator.state('recents')).toMatchObject({ preference: 'on', policy: 'paused', collecting: false }); expect(f.port.set).not.toHaveBeenCalled();
});
it('preserves healthy consent through unrelated preference writes and does not rewrite policy', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh();
    const ticket = f.coordinator.admission('diagnostics')!; const gate = deferred<void>(); vi.mocked(f.port.set).mockReturnValueOnce(gate.promise);
    const saving = f.repository.update(s => ({ ...s, theme: 'dark' })); await vi.waitFor(() => expect(f.port.set).toHaveBeenCalled());
    expect(ticket.current()).toBe(true); expect(f.coordinator.reserve('recents', 0, 0)).toBeNull();
    gate.resolve(); await saving; await f.coordinator.refresh(); expect(f.coordinator.admission('diagnostics')?.current()).toBe(true);
    expect(vi.mocked(f.policies.execute).mock.calls.filter(call => call[1].type === 'set')).toHaveLength(0);
});
it('global pause retains consent/policy and resuming healthy known consent cannot revive an old ticket', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh(); const ticket = f.coordinator.admission('diagnostics')!;
    await f.repository.update(s => ({ ...s, paused: true })); await f.coordinator.refresh(); expect(ticket.current()).toBe(false);
    expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'on', policy: 'active', globallyPaused: true, sessionBlocked: false, collecting: false });
    await f.repository.update(s => ({ ...s, paused: false })); await f.coordinator.refresh(); expect(ticket.current()).toBe(false); expect(f.coordinator.state('diagnostics').collecting).toBe(true);
    expect(vi.mocked(f.policies.execute).mock.calls.filter(call => call[1].type === 'set')).toHaveLength(0);
});
it('does not let a refresh during a pending preference write restore pre-write capture', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh(); const gate = deferred<void>();
    vi.mocked(f.port.set).mockReturnValueOnce(gate.promise); const saving = f.repository.update(s => ({ ...s, paused: true }));
    await vi.waitFor(() => expect(f.port.set).toHaveBeenCalled()); await f.coordinator.refresh(); expect(f.coordinator.admission('diagnostics')).toBeNull();
    gate.resolve(); await saving; await f.coordinator.refresh();
});
it('keeps only current post-write observations and releases each write scope once', async () => {
    const f = collectionFixture(); const gate = deferred<ReturnType<typeof loadSettings>>(); f.ports.settings.mockReturnValueOnce(gate.promise);
    const old = f.coordinator.refresh(); await Promise.resolve(); const prepared = await f.coordinator.prepare(DEFAULT_SETTINGS, collectionSettings(true), () => true);
    gate.resolve(loadSettings(collectionSettings(true))); await old; expect(f.coordinator.state('diagnostics').preference).toBe('unknown');
    prepared.release(); prepared.release(); await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'off', busy: false });
});
it('a source retired between policy read and restriction put cannot proceed to preference publication', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); let current = true;
    const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => { const value = await execute(...args); current = false; return value; });
    expect((await f.repository.commit(collectionSettings(true), 0, ID, () => current)).state).toBe('stale'); expect(f.port.set).not.toHaveBeenCalled();
    expect(vi.mocked(f.policies.execute).mock.calls.filter(call => call[1].type === 'set')).toHaveLength(0);
});
it('an existing clear reservation prevents a late collection policy write and loses authority when preferences start moving', async () => {
    const f = collectionFixture(); await f.coordinator.refresh(); const held = f.coordinator.reserve('diagnostics', 0, 0)!;
    f.values.set('diagnostics', activeCollectionPolicy()); const prepared = await f.coordinator.prepare(DEFAULT_SETTINGS, collectionSettings(true), () => true);
    expect(held.current()).toBe(false); expect(prepared.allowed).toBe(false); expect(vi.mocked(f.policies.execute).mock.calls.filter(call => call[1].type === 'set')).toHaveLength(0);
    held.release(); prepared.release(); await f.coordinator.refresh();
});
