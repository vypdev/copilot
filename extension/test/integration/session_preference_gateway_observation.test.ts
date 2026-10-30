import { afterEach, expect, it, vi } from 'vitest';
import { sessionPreferenceReviewsFixture } from '../fixtures/session_preference_reviews.ts';
import { SessionPreferenceGateway } from '../../src/application/session_preference_gateway.ts';
import { CENTER_BINDING } from '../fixtures/center.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';
import { EMPTY_SESSION_PREFERENCES as empty } from '../../src/domain/session_preferences.ts';
import { SessionPreferenceSources } from '../../src/application/session_preference_sources.ts';

afterEach(() => vi.restoreAllMocks());
async function fixture() {
    const h = await sessionPreferenceReviewsFixture(); const actor = h.center.open();
    const gateway = new SessionPreferenceGateway(h.center.controller, h.store, h.reviews, h.sources);
    return { ...h, actor, gateway, read: () => gateway.handle({ version: 1, method: 'center.session-preferences.read', clientId: actor.clientId }, actor, CENTER_BINDING) };
}
it('a retired source is refused before any native preference observation', async () => {
    const h = await fixture(); vi.spyOn(h.sources, 'capture').mockReturnValue(() => false); const inspect = vi.spyOn(h.store, 'inspect');
    expect(await h.read()).toEqual({ state: 'stale' }); expect(inspect).not.toHaveBeenCalled();
});
it.each(['first-native', 'first-source', 'second-native', 'final-source'] as const)('retirement during the %s observation discards the entire metadata projection', async stage => {
    const h = await fixture(); const inspect = h.store.inspect.bind(h.store); const source = h.sources.read.bind(h.sources); let nativeReads = 0; let sourceReads = 0;
    vi.spyOn(h.store, 'inspect').mockImplementation(async () => { const result = await inspect(); nativeReads++;
        if (stage === 'first-native' && nativeReads === 1 || stage === 'second-native' && nativeReads === 2) h.connections.invalidatePreferenceSource(); return result; });
    vi.spyOn(h.sources, 'read').mockImplementation(async current => { const result = await source(current); sourceReads++;
        if (stage === 'first-source' && sourceReads === 1 || stage === 'final-source' && sourceReads === 2) h.connections.invalidatePreferenceSource(); return result; });
    expect(await h.read()).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('different canonical native values cannot be published merely because their independent guard witness stayed equal', async () => {
    const h = await fixture(); const read = h.sources.read.bind(h.sources);
    vi.spyOn(h.sources, 'read').mockImplementationOnce(async current => { const result = await read(current); h.values.set(SESSION_PREFERENCES_KEY, { ...empty, revision: 1 }); return result; });
    expect(await h.read()).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['first', 'final'] as const)('an unavailable %s source cannot be mixed with the other valid source observation', async stage => {
    const h = await fixture(); const read = h.sources.read.bind(h.sources); let calls = 0;
    vi.spyOn(h.sources, 'read').mockImplementation(current => ++calls === (stage === 'first' ? 1 : 2) ? Promise.resolve(null) : read(current));
    expect(await h.read()).toEqual({ state: 'stale' });
});
it('two unavailable source observations preserve known empty native data without inventing saved effective values', async () => {
    const h = await fixture(); vi.spyOn(h.sources, 'read').mockResolvedValue(null);
    expect(await h.read()).toMatchObject({ state: 'ready', source: null, settingsState: 'unavailable', settingsRevision: null, effective: null, restriction: { reason: 'none' }, loaded: { state: 'ready' } });
});
it('a stable future native document remains explicitly unavailable even when the native selected identity is verified', async () => {
    const h = await fixture(); h.values.set(SESSION_PREFERENCES_KEY, { schemaVersion: 9 });
    expect(await h.read()).toMatchObject({ state: 'ready', loaded: { state: 'future' }, source: { state: 'ready' }, effective: null, restriction: { reason: 'unknown', paused: true } });
});
it('source acquisition checks liveness before and after the saved-settings read and fails closed on an acquisition exception', async () => {
    const h = await fixture(); const sources = new SessionPreferenceSources(h.repository, h.connections); const read = h.repository.read.bind(h.repository); const savedRead = vi.spyOn(h.repository, 'read');
    expect(await sources.read(() => false)).toBeNull(); expect(savedRead).not.toHaveBeenCalled();
    let live = true;
    savedRead.mockImplementation(async () => { const result = await read(); live = false; return result; });
    expect(await sources.read(() => live)).toBeNull(); expect(await sources.read(() => { throw new Error('current'); })).toBeNull();
});
