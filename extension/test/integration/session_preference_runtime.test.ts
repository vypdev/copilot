import { expect, it, vi } from 'vitest';
import { sessionPreferenceRuntimeFixture as fixture } from '../fixtures/session_preference_runtime.ts';
import { CONFIG, pageSender } from '../fixtures/page_configuration.ts';
import { PAGE, deferred } from '../fixtures/runtime.ts';
import { CONNECTION_INPUT } from '../fixtures/named_sessions.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { decodeRuntimeConfiguration } from '../../src/domain/runtime_configuration.ts';
import { EMPTY_SESSION_PREFERENCES } from '../../src/domain/session_preferences.ts';
import { PageConfigurationService } from '../../src/application/page_configuration.ts';
import { TemporaryPauseReader } from '../../src/application/temporary_pause_reader.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';

it('actual page admission applies only the verified native selection and projects all feature sources without its private scope', async () => {
    const h = await fixture(); await h.override({ density: 'compact', shortcuts: true, features: { 'BEX-NAV-01': false } });
    const value = await h.call(); expect(value).toMatchObject({ state: 'ready', connected: true, settings: { density: 'compact', shortcuts: true, features: { 'BEX-NAV-01': false } },
        provenance: { preferences: { density: 'session', shortcuts: 'session', features: { 'BEX-NAV-01': 'session' }, scope: { session: true } }, restriction: { session: { scope: 'active', restricted: false } } } });
    expect(decodeRuntimeConfiguration({ ...(value as object), sourceTree: 'unbundled' }, CONFIG, 'unbundled')).not.toBeNull();
    for (const privateValue of ['session-1', 'Work', CONNECTION_INPUT.secret, 'selectionRevision', 'operationId']) expect(JSON.stringify(value)).not.toContain(privateValue);
    expect(h.reader.read).not.toHaveBeenCalled();
});
it('a current positive session pause vetoes object GETs and retains its independent cause without inventing an emergency', async () => {
    const h = await fixture(); await h.override({ paused: true }); expect(await h.call(PAGE)).toMatchObject({ state: 'paused' });
    expect(await h.call()).toMatchObject({ settings: { paused: true }, provenance: { preferences: { pauses: ['session'] }, restriction: { native: { emergency: false }, session: { restricted: true } } } });
    expect(h.reader.read).not.toHaveBeenCalled();
});
it('a temporary false pause cannot undo an independently saved global positive pause', async () => {
    const h = await fixture(); await h.override({ paused: false }); h.local.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, paused: true, repositories: { '7': { connected: true } } });
    expect(await h.call()).toMatchObject({ settings: { paused: true }, provenance: { preferences: { pauses: ['global'] }, restriction: { session: { scope: 'active', restricted: false } } } });
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a known empty document needs no native vault or retained credential inspection for a local metadata explanation', async () => {
    const h = await fixture(false); expect(await h.call({ ...CONFIG, inspectOnly: true })).toMatchObject({ settings: { paused: false }, provenance: { restriction: { session: { scope: 'empty' } } } });
    expect(h.port.get).not.toHaveBeenCalledWith(NAMED_SESSIONS_KEY); expect(h.port.get).not.toHaveBeenCalledWith(SESSION_KEY); expect(h.reader.read).not.toHaveBeenCalled();
});
it.each(['future', 'corrupt'] as const)('a preserved %s preference document fails closed before restoration and is never repaired', async state => {
    const h = await fixture(false); h.values.set(SESSION_PREFERENCES_KEY, state === 'future' ? { schemaVersion: 9 } : { schemaVersion: 1, revision: -1 });
    expect(await h.call()).toMatchObject({ settings: { paused: true }, provenance: { restriction: { session: { native: state, scope: null, restricted: true } } } });
    expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalledWith(SESSION_KEY); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['pending', 'precaution', 'pending-precaution'] as const)('the independent %s owner blocks reads without being mislabeled as native emergency or saved session pause', async condition => {
    const h = await fixture(); const token = condition === 'precaution' ? null : h.store.guard.hold();
    if (condition !== 'pending') h.store.guard.protect();
    expect(await h.call()).toMatchObject({ settings: { paused: true }, provenance: { preferences: { pauses: [] }, restriction: { native: { emergency: false }, session: { worker: condition, native: 'not-checked', scope: null } } } });
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled(); if (token) h.store.guard.settle(token, false);
});
it('a cold positive browser-session preference prevents restoration without reading credentials or promoting retained ownership', async () => {
    const previous = await fixture(); await previous.override({ paused: true, density: 'compact' }); const h = await fixture(false);
    for (const [key, value] of previous.values) h.values.set(key, structuredClone(value)); vi.mocked(h.port.get).mockClear();
    expect(await h.call()).toMatchObject({ connected: false, settings: { density: 'comfortable', paused: true }, provenance: { preferences: { scope: { session: false }, pauses: [] }, restriction: { session: { scope: 'unverified', restricted: true } } } });
    expect(h.port.get).not.toHaveBeenCalledWith(SESSION_KEY); expect(h.port.get).not.toHaveBeenCalledWith(NAMED_SESSIONS_KEY); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a cold nonpausing override remains inactive until ordinary verified restoration and then joins the actual native selection', async () => {
    const previous = await fixture(); await previous.override({ density: 'compact' }); const h = await fixture(false);
    for (const [key, value] of previous.values) h.values.set(key, structuredClone(value)); h.advance(61000);
    expect(await h.call({ ...CONFIG, inspectOnly: true })).toMatchObject({ settings: { density: 'comfortable' }, provenance: { preferences: { scope: { session: false } }, restriction: { session: { scope: 'unverified' } } } });
    expect(h.reader.read).not.toHaveBeenCalled(); expect(await h.call()).toMatchObject({ connected: true, settings: { density: 'compact' }, provenance: { preferences: { density: 'session', scope: { session: true } } } });
    expect(h.reader.read).toHaveBeenCalledTimes(2);
});
it.each(['viewer', 'numeric-repository', 'canonical-repository'] as const)('a different page %s cannot apply selected native preferences or acquire their source label', async kind => {
    const h = await fixture(); await h.override({ density: 'compact', paused: true });
    const request = { ...CONFIG, ...(kind === 'viewer' ? { viewer: 'different' } : kind === 'numeric-repository' ? { repositoryId: '9' } : { route: 'https://github.com/other/repository/issues/42' }) };
    h.ports.currentTab.mockResolvedValue({ url: request.route, active: true, incognito: false });
    expect(await h.call(request, { ...pageSender, url: request.route, tab: { ...pageSender.tab, url: request.route } })).toMatchObject({ connected: false, settings: { density: 'comfortable', paused: false },
        provenance: { preferences: { scope: { session: false } }, restriction: { session: { scope: 'inactive', restricted: false } } } }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('reselecting the same saved connection retires enabling overrides while retaining an explicitly authored positive pause', async () => {
    const h = await fixture(); await h.override({ density: 'compact', paused: true }); await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current); vi.mocked(h.reader.read).mockClear();
    expect(await h.call()).toMatchObject({ settings: { density: 'comfortable', paused: true }, provenance: { preferences: { scope: { session: false }, pauses: [] }, restriction: { session: { scope: 'retained', restricted: true } } } });
    expect(h.reader.read).not.toHaveBeenCalled();
});
it('unknown native selection cannot apply an old override or fabricate an empty usable source', async () => {
    const h = await fixture(); await h.override({ density: 'compact' }); h.values.set(NAMED_SESSIONS_KEY, { schemaVersion: 9 });
    expect(await h.call()).toMatchObject({ connected: false, settings: { paused: true, density: 'comfortable' }, provenance: { restriction: { session: { scope: 'unknown', restricted: true } } } });
    expect(h.reader.read).not.toHaveBeenCalled();
});
it('a preference mutation retires the real page lease while an object GET waits for scheduler reservation', async () => {
    const h = await fixture(); const binding = await h.connections.preferenceBinding(h.current); if (binding.state !== 'ready') throw new Error('fixture-binding-unavailable');
    const gate = deferred<void>(); const entered = deferred<void>(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { if (key === 'copilot.schedule.v1') { entered.resolve(); await gate.promise; } await set(key, value); });
    const reading = h.call(PAGE); await entered.promise;
    const committing = h.store.commit(EMPTY_SESSION_PREFERENCES, { schemaVersion: 1, revision: 1, scope: binding.context.scope, preferences: { paused: true } }, () => true, async () => true);
    gate.resolve(); expect(await reading).toMatchObject({ state: 'stale' }); expect(await committing).toMatchObject({ state: 'committed' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('an override changed during final observation cannot publish the older unpaused configuration or issue its object GET', async () => {
    const h = await fixture(); const get = vi.mocked(h.port.get).getMockImplementation()!; let reads = 0;
    vi.mocked(h.port.get).mockImplementation(async key => { if (key === SESSION_PREFERENCES_KEY && ++reads === 2) return { schemaVersion: 9 }; return get(key); });
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('clearing temporary preferences never clears the separate native emergency pause', async () => {
    const h = await fixture(); h.values.set(SESSION_PREFERENCES_KEY, { schemaVersion: 1, revision: 2, scope: null, preferences: {} });
    h.values.set(TEMPORARY_PAUSES_KEY, { schemaVersion: 1, revision: 1, emergency: true, tabs: [] });
    expect(await h.call()).toMatchObject({ settings: { paused: true }, provenance: { restriction: { native: { emergency: true }, session: { scope: 'empty', restricted: false } } } });
    expect(h.reader.read).not.toHaveBeenCalled();
});
it('a retired page source cannot inspect native selection or later revalidate a temporary observation', async () => {
    const h = await fixture(); await h.override({ density: 'compact' }); vi.mocked(h.port.get).mockClear();
    const value = await h.admission.inspect(CONFIG, h.service.verifiedIdentity(), () => false); expect(value).toMatchObject({ profile: null, provenance: { scope: 'unknown', restricted: true } });
    expect(h.port.get).not.toHaveBeenCalledWith(NAMED_SESSIONS_KEY); vi.mocked(h.port.get).mockClear(); expect(await h.admission.unchanged(value)).toBe(false); expect(h.port.get).not.toHaveBeenCalled();
});
it('reselection retires a nonpausing enabling override without applying its earlier density or inventing a positive pause', async () => {
    const h = await fixture(); await h.override({ density: 'compact' }); await h.connections.change({ type: 'select', id: 'session-1' }, 1, h.current); vi.mocked(h.reader.read).mockClear();
    expect(await h.call()).toMatchObject({ settings: { density: 'comfortable', paused: false }, provenance: { preferences: { scope: { session: false } }, restriction: { session: { scope: 'inactive' } } } }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a preference replaced during final saved-settings observation retires the earlier configuration before publication', async () => {
    const h = await fixture(); await h.override({ density: 'compact' }); const read = h.settings.read.bind(h.settings); let calls = 0;
    vi.spyOn(h.settings, 'read').mockImplementation(async () => {
        const result = await read(); if (++calls === 2) h.values.set(SESSION_PREFERENCES_KEY, { schemaVersion: 1, revision: 2, scope: null, preferences: {} }); return result;
    });
    const service = new PageConfigurationService(h.settings, h.service, new TemporaryPauseReader(h.port, async () => true), h.admission);
    expect(await service.resolve({ ...CONFIG, inspectOnly: true }, new BrowserCancellation(), h.current, true, true, 1)).toBeNull();
    expect(calls).toBe(2); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a page source retired during final settings inspection cannot continue native preference inspection or publish its retained result', async () => {
    const h = await fixture(); const read = h.settings.read.bind(h.settings); let calls = 0; let live = true;
    vi.spyOn(h.settings, 'read').mockImplementation(async () => { const result = await read(); if (++calls === 2) live = false; return result; });
    const unchanged = vi.spyOn(h.admission, 'unchanged');
    const service = new PageConfigurationService(h.settings, h.service, new TemporaryPauseReader(h.port, async () => true), h.admission);
    expect(await service.resolve({ ...CONFIG, inspectOnly: true }, new BrowserCancellation(), () => live, true, true, 1)).toBeNull();
    expect(calls).toBe(2); expect(unchanged).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled();
});
