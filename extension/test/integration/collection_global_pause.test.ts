import { expect, it, vi } from 'vitest';
import { collectionFixture, collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { deferred } from '../fixtures/runtime.ts';

it('does not release an uncertain global pause from an ordinary read of unchanged active consent', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh();
    vi.mocked(f.port.set).mockRejectedValueOnce(new Error('native'));
    expect((await f.repository.commit({ ...collectionSettings(true), paused: true }, 0, 'e'.repeat(32), () => true)).state).toBe('unknown');
    await f.coordinator.refresh(); expect(f.coordinator.state('diagnostics')).toMatchObject({ preference: 'on', globallyPaused: false,
        policy: 'active', sessionBlocked: true, collecting: false });
    await f.coordinator.refresh(); expect(f.coordinator.admission('diagnostics')).toBeNull();
});
it('a fresh observed durable global pause allows a later reviewed resume without reviving the retired ticket', async () => {
    const f = collectionFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy()); await f.coordinator.refresh();
    const ticket = f.coordinator.admission('diagnostics')!; vi.mocked(f.port.set).mockRejectedValueOnce(new Error('native'));
    await expect(f.repository.update(s => ({ ...s, paused: true }))).rejects.toThrow('native'); await f.coordinator.refresh();
    expect(f.coordinator.state('diagnostics').sessionBlocked).toBe(true);
    await f.repository.update(s => ({ ...s, paused: true })); await f.coordinator.refresh();
    expect(f.coordinator.state('diagnostics')).toMatchObject({ globallyPaused: true, sessionBlocked: false, collecting: false });
    await f.repository.update(s => ({ ...s, paused: false })); await f.coordinator.refresh();
    expect(f.coordinator.state('diagnostics').collecting).toBe(true); expect(ticket.current()).toBe(false);
});
it.each([false, true])('a reviewed resume after a coalesced pause read restores only the durable preference (resume persisted: %s)', async persisted => {
    const settings = collectionSettings(true, true); const f = collectionFixture(settings);
    f.values.set('diagnostics', activeCollectionPolicy()); f.values.set('recents', activeCollectionPolicy('recents'));
    await f.coordinator.refresh();
    const tickets = [f.coordinator.admission('diagnostics')!, f.coordinator.admission('recents')!];
    const hold = deferred<void>(); const entered = deferred<void>();
    f.ports.settings.mockImplementationOnce(async () => {
        const paused = await f.repository.read(); entered.resolve(); await hold.promise; return paused;
    });
    const pause = await f.repository.commit({ ...settings, paused: true }, 0, 'a'.repeat(32), () => true);
    expect(pause).toMatchObject({ state: 'committed', revision: 1 }); await entered.promise;
    try {
        expect(f.coordinator.state('diagnostics')).toMatchObject({ globallyPaused: null, sessionBlocked: true, collecting: false });
        if (!persisted) vi.mocked(f.port.set).mockRejectedValueOnce(new Error('native'));
        const resume = await f.repository.commit(settings, 1, 'b'.repeat(32), () => true);
        expect(resume.state).toBe(persisted ? 'committed' : 'unknown');
        expect(f.coordinator.admission('diagnostics')).toBeNull(); expect(f.coordinator.admission('recents')).toBeNull();
    } finally { hold.resolve(); }
    await f.coordinator.refresh();
    for (const kind of ['diagnostics', 'recents'] as const) {
        expect(f.coordinator.state(kind)).toMatchObject({ globallyPaused: !persisted, sessionBlocked: false, collecting: persisted });
    }
    expect(tickets.map(ticket => ticket.current())).toEqual([false, false]);
});
