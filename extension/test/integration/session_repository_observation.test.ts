import { expect, it, vi } from 'vitest';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { memoryStore } from '../fixtures/runtime.ts';

const connected = (settings: typeof DEFAULT_SETTINGS) => ({ ...settings, repositories: { ...settings.repositories, '7': { connected: true } } });
it.each(['without-observer', 'broken-submission', 'broken-result'] as const)('canonical preference verification is mandatory %s', async mode => {
    const h = memoryStore(); const repo = new SettingsRepository(h.port); const submitted = vi.fn(); const settled = vi.fn();
    if (mode === 'broken-submission') submitted.mockImplementation(() => { throw new Error('secondary'); });
    if (mode === 'broken-result') settled.mockImplementation(() => { throw new Error('secondary'); });
    const result = await repo.updateObserved(connected, () => true, mode === 'without-observer' ? undefined : { submitted, settled });
    expect(result).toMatchObject({ revision: 1, repositories: { '7': { connected: true } } });
    expect(h.port.set).toHaveBeenCalledOnce(); expect(h.port.get).toHaveBeenCalledTimes(2);
    if (mode !== 'without-observer') expect(settled).toHaveBeenCalledWith({ acknowledgement: 'accepted', observation: 'committed' });
});
it.each(['lost-ack', 'unapplied', 'failed-read', 'future-read'] as const)('repository opt-in %s uses one actual attempt and canonical result', async mode => {
    const h = memoryStore(); const repo = new SettingsRepository(h.port);
    vi.mocked(h.port.set).mockImplementation(async (key, value) => {
        if (mode !== 'unapplied') h.values.set(key, structuredClone(value));
        if (mode === 'lost-ack') throw new Error('private native failure');
        if (mode === 'failed-read') vi.mocked(h.port.get).mockRejectedValueOnce(new Error('private read failure'));
        if (mode === 'future-read') h.values.set(SETTINGS_KEY, { schemaVersion: 99 });
    });
    const settled = vi.fn(); const result = repo.updateObserved(connected, () => true, { submitted() {}, settled });
    if (mode === 'lost-ack') expect(await result).toMatchObject({ revision: 1 }); else await expect(result).rejects.toThrow('settings-write-unconfirmed');
    expect(h.port.set).toHaveBeenCalledOnce(); expect(settled).toHaveBeenCalledExactlyOnceWith({ acknowledgement: mode === 'lost-ack' ? 'unknown' : 'accepted',
        observation: mode === 'lost-ack' ? 'committed' : mode === 'failed-read' ? 'unavailable' : 'different' });
});
it('waiting for the shared queue cannot admit a session preference after its primary source is retired', async () => {
    const h = memoryStore(); const repo = new SettingsRepository(h.port); const reservation = repo.reserveMutations()!;
    let current = true; const submitted = vi.fn();
    const pending = repo.updateObserved(connected, () => current, { submitted, settled() {} }); current = false;
    reservation.release(); await expect(pending).rejects.toThrow('settings-conflict-or-invalid');
    expect(h.port.set).not.toHaveBeenCalled(); expect(submitted).not.toHaveBeenCalled();
});
it('preflight rejection releases its reservation without a submitted effect and the next update can recover', async () => {
    const h = memoryStore(); const release = vi.fn(); const prepare = vi.fn(async () => ({ allowed: false, release }));
    const repo = new SettingsRepository(h.port, { prepare }); const submitted = vi.fn();
    await expect(repo.updateObserved(connected, () => true, { submitted, settled() {} })).rejects.toThrow('settings-collection-unavailable');
    expect(release).toHaveBeenCalledOnce(); expect(submitted).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
    prepare.mockResolvedValueOnce({ allowed: true, release }); expect(await repo.updateObserved(connected, () => true)).toMatchObject({ revision: 1 });
});
