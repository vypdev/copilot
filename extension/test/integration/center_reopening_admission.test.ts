import { expect, it } from 'vitest';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { deferred } from '../fixtures/runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { currentCenterSettings } from '../../src/domain/center_client_view.ts';

it.each(['center.open', 'center.read'] as const)('a fresh native start does not promote old settings while %s is suspended', async method => {
    const h = centerClientFixture(); await h.client.start(); const previous = h.client.view.data;
    const entered = deferred<void>(); const gate = deferred<void>(); const send = h.port.send.getMockImplementation()!;
    h.port.send.mockImplementation(async message => { if (message.method === method) { entered.resolve(); await gate.promise; } return send(message); });
    const opening = h.client.start(); await entered.promise;
    try { expect(h.client.view.data).toBe(previous); expect(h.client.view.phase).toBe('loading'); expect(currentCenterSettings(h.client.view)).toBe(null); }
    finally { h.native.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 1, theme: 'dark' }); gate.resolve(); await opening; }
    expect(currentCenterSettings(h.client.view)).toMatchObject({ revision: 1, theme: 'dark' });
    h.client.stop(); expect(h.client.view.data?.state).toBe('ready'); expect(currentCenterSettings(h.client.view)).toBe(null);
    expect(h.native.port.set).not.toHaveBeenCalled();
});
