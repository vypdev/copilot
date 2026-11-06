import { afterEach, expect, it, vi } from 'vitest';
import { sessionPreferenceReviewsFixture as fixture } from '../fixtures/session_preference_reviews.ts';
import { deferred } from '../fixtures/runtime.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SESSION_PREFERENCES_KEY } from '../../src/application/session_preferences_reader.ts';

afterEach(() => vi.restoreAllMocks());
it('the actual retained review infers scope and previews monotonic effects without native submission, provider work or secret return', async () => {
    const h = await fixture({ ...DEFAULT_SETTINGS, paused: true }); const plan = await h.plan({ type: 'replace', preferences: { density: 'compact', paused: false } });
    expect(plan).toMatchObject({ state: 'preview', action: 'replace', before: { scope: null }, after: { scope: { entryId: 'session-1', selectionRevision: 1 } },
        effectiveBefore: { paused: true, density: 'comfortable' }, effectiveAfter: { paused: true, density: 'compact' }, source: { name: 'Work', repository: 'octo/example' } });
    expect(plan.effectiveAfter?.pauseSources).toEqual(['global']); expect(JSON.stringify(plan)).not.toContain('synthetic_not_a_real_credential');
    expect(h.port.set).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled(); expect(h.reviews.inspect(plan.operationId, 0, h.owner)).toEqual({ state: 'not-submitted' });
});
it('concurrent confirmations join one native attempt, expose frozen factual progress and replay only the completed scalar receipt', async () => {
    const h = await fixture(); const plan = await h.plan(); const gate = deferred<void>(); const entered = deferred<void>(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { if (key === SESSION_PREFERENCES_KEY) { entered.resolve(); await gate.promise; } await set(key, value); });
    const first = h.reviews.confirm(plan.operationId, 0, h.owner); const second = h.reviews.confirm(plan.operationId, 0, h.owner); expect(second).toBe(first);
    const early = h.reviews.inspect(plan.operationId, 0, h.owner); expect(early).toEqual({ state: 'pending', facts: { attempt: 'unobserved', acknowledgement: null, observation: null } });
    await entered.promise; expect(h.reviews.inspect(plan.operationId, 0, h.owner)).toEqual({ state: 'pending', facts: { attempt: 'submitted', acknowledgement: null, observation: null } });
    expect(h.reviews.cancel(plan.operationId, 0, h.owner)).toMatchObject({ state: 'pending' }); gate.resolve();
    const result = await first; expect(result).toEqual({ state: 'result', outcome: { state: 'committed', revision: 1, acknowledgement: 'accepted', current: true }, facts: { attempt: 'submitted', acknowledgement: 'accepted', observation: 'committed' } });
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toEqual(result); expect(h.reviews.cancel(plan.operationId, 0, h.owner)).toEqual(result);
    expect(h.port.set).toHaveBeenCalledOnce(); expect(early).toMatchObject({ facts: { attempt: 'unobserved' } });
});
it('unknown accepted native state requires an explicit adoption review; later inspection never certifies that earlier operation', async () => {
    const h = await fixture(); vi.mocked(h.port.set).mockResolvedValue(undefined); const plan = await h.plan();
    const result = await h.reviews.confirm(plan.operationId, 0, h.owner); expect(result).toMatchObject({ state: 'result', outcome: { state: 'unknown', observation: 'different' }, facts: { acknowledgement: 'accepted', observation: 'different' } });
    expect(await h.preview()).toEqual({ state: 'precaution' }); const adoption = await h.plan({ type: 'adopt-observed' }); expect(adoption).toMatchObject({ precautionBefore: true, precautionAfter: false, action: 'adopt-observed' });
    expect(await h.reviews.confirm(adoption.operationId, 0, h.owner)).toMatchObject({ state: 'result', outcome: { state: 'reconciled', revision: 0 }, facts: { attempt: 'unobserved', acknowledgement: null, observation: null } });
    expect(h.reviews.inspect(plan.operationId, 0, h.owner)).toEqual(result); expect(h.port.set).toHaveBeenCalledOnce();
});
it('cancel before submission retains a terminal receipt and cannot be followed by a native write through old confirm', async () => {
    const h = await fixture(); const plan = await h.plan(); const cancelled = h.reviews.cancel(plan.operationId, 0, h.owner);
    expect(cancelled).toEqual({ state: 'result', outcome: { state: 'cancelled' }, facts: { attempt: 'unobserved', acknowledgement: null, observation: null } });
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toEqual(cancelled); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['takeover', 'source', 'settings-content', 'settings-revision', 'expiry', 'invalidated'] as const)('a %s change prevents the retained plan from writing against another source', async kind => {
    const h = await fixture(); const plan = await h.plan();
    if (kind === 'takeover') h.takeover(); if (kind === 'source') h.connections.invalidatePreferenceSource();
    if (kind === 'settings-content') h.local.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, density: 'compact' });
    if (kind === 'settings-revision') h.local.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision: 1 });
    if (kind === 'expiry') h.advance(300000); if (kind === 'invalidated') h.reviews.invalidate();
    const result = await h.reviews.confirm(plan.operationId, 0, h.owner);
    expect(result).toMatchObject(kind.startsWith('settings') ? { state: 'result', outcome: { state: 'stale' } } : { state: kind === 'expiry' || kind === 'invalidated' ? 'expired' : 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it('a saved settings reservation blocks confirmation admission without a native attempt and is released after ordinary completion', async () => {
    const h = await fixture(); const plan = await h.plan(); const held = h.repository.reserveMutations()!;
    expect(await h.reviews.confirm(plan.operationId, 0, h.owner)).toMatchObject({ state: 'result', outcome: { state: 'busy' }, facts: { attempt: 'unobserved' } }); expect(h.port.set).not.toHaveBeenCalled();
    held.release(); await h.confirm(); const after = h.repository.reserveMutations(); expect(after).not.toBeNull(); after!.release();
});
it('saved preference writes queued during native confirmation cannot overtake its reserved effective-state snapshot', async () => {
    const h = await fixture(); const plan = await h.plan(); const entered = deferred<void>(); const gate = deferred<void>(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { if (key === SESSION_PREFERENCES_KEY) { entered.resolve(); await gate.promise; } await set(key, value); });
    const confirming = h.reviews.confirm(plan.operationId, 0, h.owner); await entered.promise;
    const updating = h.repository.updateObserved(value => ({ ...value, density: 'compact' }), () => true); await Promise.resolve(); expect(h.local.port.set).not.toHaveBeenCalled();
    gate.resolve(); expect(await confirming).toMatchObject({ state: 'result', outcome: { state: 'committed' } }); await updating;
    expect(h.local.port.set).toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled();
});
it('an unverified native selection cannot receive enabling preferences, while clearing an observed document needs no invented identity', async () => {
    const h = await fixture(); await h.service.revoke();
    expect(await h.preview()).toEqual({ state: 'unverified' }); expect(await h.preview({ type: 'clear' })).toEqual({ state: 'unchanged' }); expect(h.reader.read).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('pending review capacity, native identifier collisions and invalid ownership remain bounded before effects', async () => {
    const h = await fixture(); const first = await h.plan(); h.ports.identifier.mockReturnValueOnce(first.operationId); expect(await h.preview()).toEqual({ state: 'unavailable' });
    expect(await h.reviews.preview({ type: 'replace', preferences: {} }, 'b'.repeat(32), 0)).toEqual({ state: 'denied' });
    for (let i = 1; i < 16; i++) await h.plan(); expect(await h.preview()).toEqual({ state: 'busy' });
    expect(h.reviews.inspect(first.operationId, 1, h.owner)).toEqual({ state: 'denied' }); expect(await h.reviews.confirm('not-an-id', 0, h.owner)).toEqual({ state: 'invalid' }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['invalid', 'future', 'unreadable'] as const)('known native clear remains independently reviewed when saved preferences are %s without using fallback effective values', async state => {
    const h = await fixture(); expect(await h.confirm()).toMatchObject({ state: 'result', outcome: { state: 'committed', revision: 1 } }); vi.mocked(h.port.set).mockClear();
    if (state === 'unreadable') vi.mocked(h.local.port.get).mockRejectedValue(new Error('private saved preferences unavailable'));
    else h.local.values.set(SETTINGS_KEY, { schemaVersion: state === 'future' ? 99 : 0 });
    const original = structuredClone(h.local.values.get(SETTINGS_KEY)); const plan = await h.plan({ type: 'clear' }, 1);
    expect(plan.effectiveBefore).toBeNull(); expect(plan.effectiveAfter).toBeNull();
    expect(await h.reviews.confirm(plan.operationId, 1, h.owner)).toMatchObject({ state: 'result', outcome: { state: 'committed', revision: 2 } });
    expect(h.values.get(SESSION_PREFERENCES_KEY)).toMatchObject({ revision: 2, scope: null, preferences: {} }); expect(h.local.values.get(SETTINGS_KEY)).toEqual(original);
    expect(h.local.port.set).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled();
});
