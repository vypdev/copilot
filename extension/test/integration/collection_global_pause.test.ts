import { expect, it, vi } from 'vitest';
import { collectionFixture, collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';

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
