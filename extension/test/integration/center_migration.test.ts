import { expect, it, vi } from 'vitest';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

function legacy() { const { center: _center, ...base } = DEFAULT_SETTINGS; return { ...base, schemaVersion: 1, revision: 8, density: 'compact' }; }
it('a rejected migration retains the original data, exposes read-only migration state and retries only on another read', async () => {
    const h = centerClientFixture(); const original = legacy(); h.native.values.set(SETTINGS_KEY, original);
    vi.mocked(h.native.port.set).mockRejectedValueOnce(new Error('private-quota-detail')); await h.client.start();
    expect(h.client.view.data).toMatchObject({ state: 'migration-required', settings: { revision: 8, density: 'compact' } });
    expect(h.native.values.get(SETTINGS_KEY)).toEqual(original);
    const calls = h.port.send.mock.calls.length; await h.client.preview({ type: 'preferences', values: { theme: 'dark' } }, 8);
    expect(h.port.send).toHaveBeenCalledTimes(calls); expect(h.native.port.set).toHaveBeenCalledTimes(1);
    await h.client.refresh(); expect(h.client.view.data).toMatchObject({ state: 'ready', settings: { revision: 8, density: 'compact' } });
    expect(h.native.values.get(SETTINGS_KEY)).toMatchObject({ current: { schemaVersion: 2, revision: 8 }, previous: original });
    expect(JSON.stringify(h.client.view)).not.toContain('private-quota-detail');
});
it('an actually persisted migration with a lost acknowledgement is observed without repeating the migration write', async () => {
    const h = centerClientFixture(); const original = legacy(); h.native.values.set(SETTINGS_KEY, original);
    vi.mocked(h.native.port.set).mockImplementationOnce(async (key, value) => { h.native.values.set(key, structuredClone(value)); throw new Error('lost-ack'); });
    await h.client.start(); expect(h.client.view.data).toMatchObject({ state: 'ready', rollbackAvailable: true, settings: { revision: 8, schemaVersion: 2 } });
    await h.client.refresh(); expect(h.native.port.set).toHaveBeenCalledTimes(1);
    expect(h.native.values.get(SETTINGS_KEY)).toMatchObject({ current: { schemaVersion: 2 }, previous: original });
});
