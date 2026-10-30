import { afterEach, expect, it, vi } from 'vitest';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
import { CONFIG, pageSender } from '../fixtures/page_configuration.ts';
import { CONNECTED, PAGE } from '../fixtures/runtime.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';

const stops: (() => void)[] = []; afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function fixture(configure: Parameters<typeof backgroundCenterFixture>[0] = () => undefined) {
    const h = backgroundCenterFixture(browser => {
        browser.localValues.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, repositories: { '7': { connected: true } } }); browser.sessionValues.set(SESSION_KEY, CONNECTED); configure(browser);
    }); stops.push(h.stop); const owner = await h.call({ version: 1, method: 'center.open' }); expect(owner.state).toBe('ready');
    const header = { version: 1, clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch };
    const read = () => h.call({ version: 1, method: 'center.pauses.read', clientId: owner.clientId });
    const preview = (intent: unknown = { type: 'emergency', paused: true }, expectedRevision = 0) => h.call({ ...header, method: 'center.pauses.preview', intent, expectedRevision });
    const operation = (plan: Record<string, unknown>, action = 'confirm') => h.call({ ...header, method: `center.pauses.${action}`, operationId: plan.operationId, expectedRevision: plan.revision });
    return { ...h, owner, header, read, preview, operation };
}
it('actual native metadata is independent of credentials/preferences and never exposes a guard witness or source URL', async () => {
    const h = await fixture(browser => { vi.mocked(browser.api.tabs.query).mockResolvedValue([{ id: 7 }]); });
    const value = await h.read(); expect(value).toMatchObject({ state: 'ready', loaded: { state: 'ready', value: { revision: 0, emergency: false, tabs: [] } }, precaution: false, pending: false,
        targets: { state: 'ready', tabs: [{ tabId: 7, label: 'octo/example · #42' }], limited: false } });
    for (const forbidden of ['witness', 'synthetic_not_a_real_credential', 'https://github.com/', 'controllerEpoch']) expect(JSON.stringify(value)).not.toContain(forbidden);
    expect(h.provider).not.toHaveBeenCalled(); expect(h.api.permissions.request).not.toHaveBeenCalled();
});
it('native emergency pause changes only its separate document, invalidates runtime and replays without a second write', async () => {
    const h = await fixture(); const saved = structuredClone(h.localValues.get(SETTINGS_KEY)); const plan = await h.preview(); expect(plan.state).toBe('preview');
    expect(await h.operation(plan)).toMatchObject({ state: 'committed', revision: 1, current: true }); expect(await h.operation(plan)).toMatchObject({ state: 'committed' });
    const writes = vi.mocked(h.sessionArea.set).mock.calls.filter(([value]) => Object.hasOwn(value, TEMPORARY_PAUSES_KEY)); expect(writes).toHaveLength(1);
    expect(h.localValues.get(SETTINGS_KEY)).toEqual(saved); expect(await h.call(PAGE, pageSender)).toMatchObject({ state: 'paused' }); expect(h.provider).not.toHaveBeenCalled();
});
it('a native accepted no-op retains the exact shared runtime precaution; a later metadata read cannot resume', async () => {
    const h = await fixture(); vi.mocked(h.sessionArea.set).mockResolvedValue(undefined); const plan = await h.preview();
    expect(await h.operation(plan)).toMatchObject({ state: 'unknown', observation: 'different', acknowledgement: 'accepted' });
    expect(await h.read()).toMatchObject({ precaution: true, pending: false }); expect(await h.call(CONFIG, pageSender)).toMatchObject({ settings: { paused: true }, connected: false });
    expect(await h.operation(plan, 'result')).toMatchObject({ state: 'unknown' }); expect(h.provider).not.toHaveBeenCalled();
});
it('explicit native adoption releases only precaution, performs no pause write, and still requires normal identity restoration', async () => {
    const h = await fixture(); vi.mocked(h.sessionArea.set).mockResolvedValue(undefined); const plan = await h.preview(); await h.operation(plan);
    const adopt = await h.preview({ type: 'adopt-observed' }); expect(adopt).toMatchObject({ state: 'preview', precautionBefore: true, precautionAfter: false });
    expect(await h.operation(adopt)).toMatchObject({ state: 'reconciled', revision: 0 });
    expect(vi.mocked(h.sessionArea.set).mock.calls.filter(([value]) => Object.hasOwn(value, TEMPORARY_PAUSES_KEY))).toHaveLength(1);
    expect(await h.call(CONFIG, pageSender)).toMatchObject({ state: 'ready', connected: true, settings: { paused: false } }); expect(h.provider).toHaveBeenCalledTimes(2);
    expect(await h.operation(plan, 'result')).toMatchObject({ state: 'unknown' }); expect(h.api.permissions.request).not.toHaveBeenCalled();
});
it('an observer can inspect native controls but cannot preview, confirm, cancel or inspect another owner operation', async () => {
    const h = await fixture(); const plan = await h.preview(); const source = { ...h.sender, documentId: 'observer', tab: { id: 2, incognito: false } };
    const owner = await h.call({ version: 1, method: 'center.open' }, source); expect(owner.role).toBe('observer');
    expect(await h.call({ version: 1, method: 'center.pauses.read', clientId: owner.clientId }, source)).toMatchObject({ state: 'ready' });
    const header = { version: 1, clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch, expectedRevision: 0 };
    expect(await h.call({ ...header, method: 'center.pauses.preview', intent: { type: 'emergency', paused: true } }, source)).toMatchObject({ state: 'denied' });
    for (const action of ['confirm', 'cancel', 'result']) expect(await h.call({ ...header, method: `center.pauses.${action}`, operationId: plan.operationId }, source)).toMatchObject({ state: 'denied' });
    expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('takeover and wrong native document/credential epoch cannot reuse an old authoring review', async () => {
    const h = await fixture(); const plan = await h.preview(); const source = { ...h.sender, documentId: 'new editor', tab: { id: 2, incognito: false } };
    const owner = await h.call({ version: 1, method: 'center.open' }, source);
    expect(await h.call({ version: 1, method: 'center.claim', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch }, source)).toMatchObject({ role: 'editor' });
    expect(await h.operation(plan)).toMatchObject({ state: 'stale' });
    expect(await h.call({ version: 1, method: 'center.pauses.read', clientId: h.owner.clientId }, source)).toMatchObject({ state: 'stale' });
    const header = { version: 1, clientId: owner.clientId, controllerEpoch: 2, credentialEpoch: 9, expectedRevision: 0 };
    expect(await h.call({ ...header, method: 'center.pauses.preview', intent: { type: 'emergency', paused: true } }, source)).toMatchObject({ state: 'stale' }); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('page content, foreign native IDs and incognito sources cannot invoke the native pause protocol', async () => {
    const h = await fixture(); const value = { ...h.header, method: 'center.pauses.preview', intent: { type: 'emergency', paused: true }, expectedRevision: 0 };
    for (const sender of [pageSender, { ...h.sender, id: 'foreign' }, { ...h.sender, tab: { id: 1, incognito: true } }]) expect(await h.call(value, sender)).toMatchObject({ state: 'rejected' });
    expect(h.sessionArea.set).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it('a native target reload expires a tab review even if the last committed URL stays unchanged', async () => {
    const h = await fixture(); const plan = await h.preview({ type: 'tab', tabId: 7, paused: true }); expect(plan.state).toBe('preview');
    for (const listener of h.onUpdated.listeners) listener(7, { status: 'loading' });
    expect(await h.operation(plan)).toMatchObject({ state: 'expired' }); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('native cancellation cannot be interpreted as a committed pause or start a provider request', async () => {
    const h = await fixture(); const plan = await h.preview(); expect(await h.operation(plan, 'cancel')).toMatchObject({ state: 'cancelled' });
    expect(await h.operation(plan)).toMatchObject({ state: 'cancelled' }); expect(h.sessionArea.set).not.toHaveBeenCalled(); expect(h.provider).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt'] as const)('%s saved preferences cannot prevent independent native safety controls or be overwritten by them', async state => {
    const raw = state === 'future' ? { schemaVersion: 99, preserve: true } : { damaged: true };
    const h = await fixture(browser => { browser.localValues.set(SETTINGS_KEY, raw); }); const plan = await h.preview();
    expect(await h.operation(plan)).toMatchObject({ state: 'committed' }); expect(h.localValues.get(SETTINGS_KEY)).toEqual(raw); expect(h.provider).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt'] as const)('%s native pause data is preserved and never exposed as an empty default or reset', async state => {
    const raw = state === 'future' ? { schemaVersion: 99, private: 'keep' } : null;
    const h = await fixture(browser => { browser.sessionValues.set(TEMPORARY_PAUSES_KEY, raw); });
    expect(await h.read()).toMatchObject({ loaded: { state } }); expect(await h.preview()).toMatchObject({ state }); expect(h.sessionValues.get(TEMPORARY_PAUSES_KEY)).toEqual(raw); expect(h.sessionArea.set).not.toHaveBeenCalled();
});
it('native tab closure expires only its saved scope and preserves emergency and other tabs', async () => {
    const h = await fixture(browser => { browser.sessionValues.set(TEMPORARY_PAUSES_KEY, { schemaVersion: 1, revision: 4, emergency: true, tabs: [7, 9] }); });
    for (const listener of h.onRemoved.listeners) listener(7);
    await vi.waitFor(() => expect(h.sessionValues.get(TEMPORARY_PAUSES_KEY)).toEqual({ schemaVersion: 1, revision: 5, emergency: true, tabs: [9] })); expect(h.provider).not.toHaveBeenCalled();
});
it('an unknown native closure write uses the shared precaution rather than silently enabling a different live tab', async () => {
    const h = await fixture(browser => { browser.sessionValues.set(TEMPORARY_PAUSES_KEY, { schemaVersion: 1, revision: 4, emergency: false, tabs: [7] }); });
    vi.mocked(h.sessionArea.set).mockResolvedValue(undefined); for (const listener of h.onRemoved.listeners) listener(7);
    await vi.waitFor(() => expect(h.sessionArea.set).toHaveBeenCalled()); await vi.waitFor(async () => expect(await h.read()).toMatchObject({ precaution: true }));
    expect(await h.call(CONFIG, pageSender)).toMatchObject({ connected: false, settings: { paused: true } }); expect(h.provider).not.toHaveBeenCalled();
});
