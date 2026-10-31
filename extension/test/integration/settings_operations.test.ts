import { expect, it, vi } from 'vitest';
import { SettingsOperations } from '../../src/application/settings_operations.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SETTINGS_OWNER as OWNER, settingsOperationsFixture } from '../fixtures/settings_operations.ts';

const change = { type: 'preferences', values: { density: 'compact' } };

it('bexh3-center-C13 preview and cancellation retain durable settings byte-for-byte and never create a write', async () => {
    const h = settingsOperationsFixture(); const original = { current: DEFAULT_SETTINGS };
    h.values.set(SETTINGS_KEY, original); const before = JSON.stringify(original);
    const result = await h.operations.preview(change, OWNER);
    expect(result).toMatchObject({ state: 'preview', revision: 0, expiresAt: 301000, action: 'preferences',
        before: DEFAULT_SETTINGS, after: { density: 'compact', revision: 0 } });
    if (result.state !== 'preview') throw new Error('expected preview');
    expect(h.operations.cancel(result.operationId, result.revision, OWNER)).toEqual({ state: 'cancelled' });
    expect(await h.operations.confirm(result.operationId, result.revision, OWNER)).toEqual({ state: 'expired' });
    expect(JSON.stringify(h.values.get(SETTINGS_KEY))).toBe(before); expect(h.port.set).not.toHaveBeenCalled();
});
it('bexh3-center-C13 cancelling an actual import preview preserves the complete durable envelope and rejects later confirmation', async () => {
    const h = settingsOperationsFixture(); const original = { current: { ...DEFAULT_SETTINGS, density: 'compact' as const } };
    h.values.set(SETTINGS_KEY, structuredClone(original)); const before = JSON.stringify(h.values.get(SETTINGS_KEY));
    const result = await h.operations.preview({ type: 'import', settings: { ...DEFAULT_SETTINGS, theme: 'dark' } }, OWNER);
    expect(result).toMatchObject({ state: 'preview', action: 'import', revision: 0,
        before: original.current, after: { theme: 'dark', density: 'comfortable' } });
    if (result.state !== 'preview') throw new Error('expected import preview');
    expect(h.port.set).not.toHaveBeenCalled();
    expect(h.operations.cancel(result.operationId, result.revision, OWNER)).toEqual({ state: 'cancelled' });
    expect(await h.operations.confirm(result.operationId, result.revision, OWNER)).toEqual({ state: 'expired' });
    expect(JSON.stringify(h.values.get(SETTINGS_KEY))).toBe(before); expect(h.port.set).not.toHaveBeenCalled();
});
it('a confirmed immutable plan writes exactly its retained after-state, not a changed copy of the browser view', async () => {
    const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
    if (preview.state !== 'preview') throw new Error('expected preview');
    const browserView = { ...structuredClone(preview) }; browserView.after = { ...browserView.after, density: 'comfortable' };
    expect(browserView.after.density).toBe('comfortable');
    const first = h.operations.confirm(preview.operationId, preview.revision, OWNER);
    const duplicate = h.operations.confirm(preview.operationId, preview.revision, OWNER);
    expect(await first).toEqual({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: true });
    expect(await duplicate).toEqual(await first);
    expect(await h.repository.read()).toMatchObject({ settings: { revision: 1, density: 'compact' } });
    expect(h.port.set).toHaveBeenCalledTimes(1); expect(h.ports.notify).toHaveBeenCalledTimes(1);
    expect(await h.operations.confirm(preview.operationId, preview.revision, OWNER)).toEqual(await first);
    expect(h.operations.cancel(preview.operationId, preview.revision, OWNER)).toEqual(await first);
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('a different controller or wrong preview revision cannot confirm or cancel another active plan', async () => {
    const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
    if (preview.state !== 'preview') throw new Error('expected preview');
    for (const [revision, owner] of [[preview.revision + 1, OWNER], [preview.revision, 'd'.repeat(32)]] as const) {
        expect(await h.operations.confirm(preview.operationId, revision, owner)).toEqual({ state: 'denied' });
        expect(h.operations.cancel(preview.operationId, revision, owner)).toEqual({ state: 'denied' });
    }
    expect(h.port.set).not.toHaveBeenCalled();
});
it('bexh3-center-C15 a newer stored revision invalidates a preview without replacing newer preferences', async () => {
    const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
    if (preview.state !== 'preview') throw new Error('expected preview');
    await h.repository.update(settings => ({ ...settings, locale: 'es' }));
    expect(await h.operations.confirm(preview.operationId, preview.revision, OWNER)).toEqual({ state: 'conflict' });
    expect(await h.repository.read()).toMatchObject({ settings: { revision: 1, locale: 'es', density: 'comfortable' } });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('unknown outcomes and notification failures preserve actual saved/observed facts without a second mutation', async () => {
    const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
    if (preview.state !== 'preview') throw new Error('expected preview');
    h.ports.notify.mockImplementation(() => { throw new Error('synthetic_secret'); });
    expect(await h.operations.confirm(preview.operationId, 0, OWNER)).toMatchObject({ state: 'committed' });
    expect(await h.repository.read()).toMatchObject({ settings: { revision: 1 } });
    const uncertain = await h.operations.preview({ type: 'preferences', values: { density: 'comfortable' } }, OWNER);
    if (uncertain.state !== 'preview') throw new Error('expected preview');
    vi.spyOn(h.repository, 'commit').mockRejectedValueOnce(new Error('private provider text'));
    expect(await h.operations.confirm(uncertain.operationId, 1, OWNER)).toEqual({ state: 'unknown', acknowledgement: 'unknown',
        observedRevision: null, observation: 'unavailable' });
    expect(await h.operations.confirm(uncertain.operationId, 1, OWNER)).toMatchObject({ state: 'unknown' });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('a worker restart cannot revive a lost preview or reuse its prior confirmation as authority', async () => {
    const h = settingsOperationsFixture(); const preview = await h.operations.preview(change, OWNER);
    if (preview.state !== 'preview') throw new Error('expected preview');
    const restarted = new SettingsOperations(h.repository, h.ports);
    expect(await restarted.confirm(preview.operationId, 0, OWNER)).toEqual({ state: 'expired' });
    expect(h.port.set).not.toHaveBeenCalled();
    await h.operations.confirm(preview.operationId, 0, OWNER);
    expect(await restarted.confirm(preview.operationId, 0, OWNER)).toEqual({ state: 'expired' });
    expect((await h.repository.inspect()).operation).toEqual({ id: preview.operationId, beforeRevision: 0 });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('read-only source failures and invalid intents cannot publish previews or alter unknown storage', async () => {
    const h = settingsOperationsFixture();
    expect(await h.operations.preview({}, OWNER)).toMatchObject({ state: 'invalid' });
    expect(await h.operations.preview({ type: 'preferences', values: {} }, OWNER)).toEqual({ state: 'unchanged' });
    expect(await h.operations.preview(null, OWNER)).toMatchObject({ state: 'invalid' });
    for (const [raw, state] of [[{ schemaVersion: 99 }, 'future'], [{ schemaVersion: 2 }, 'corrupt'],
        [{ schemaVersion: 0, compact: true }, 'migration-required']] as const) {
        h.values.set(SETTINGS_KEY, raw);
        expect(await h.operations.preview(change, OWNER)).toEqual({ state }); expect(h.values.get(SETTINGS_KEY)).toEqual(raw);
    }
    vi.mocked(h.port.get).mockRejectedValueOnce(new Error('secret storage error'));
    expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'unavailable' });
    expect(h.port.set).not.toHaveBeenCalled();
});
it('expired, malformed and unauthorized operation references fail without storage effects', async () => {
    const h = settingsOperationsFixture();
    for (const [id, revision] of [['bad', 0], ['a'.repeat(32), -1]] as const) {
        expect(await h.operations.confirm(id, revision, OWNER)).toEqual({ state: 'invalid' });
        expect(h.operations.cancel(id, revision, OWNER)).toEqual({ state: 'invalid' });
    }
    expect(h.operations.cancel('a'.repeat(32), 0, OWNER)).toEqual({ state: 'expired' });
    expect(await h.operations.preview(change, 'invalid-owner')).toEqual({ state: 'denied' });
    expect(await h.operations.preview(change, 'd'.repeat(32))).toEqual({ state: 'denied' });
    expect(h.port.set).not.toHaveBeenCalled();
});
