import { expect, it, vi } from 'vitest';
import { collectionCurrent, pauseCollectionPolicy, readCollectionPolicy } from '../../src/application/collection_restrictions.ts';
import type { CollectionPolicy, CollectionPolicyResult } from '../../src/domain/collection_policy.ts';
import { collectionFixture } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';

it('observes a missing native policy as paused without manufacturing a consent receipt', async () => {
    const f = collectionFixture(); const result = await pauseCollectionPolicy(f.policies, 'diagnostics', 0, f.ports.identifier, () => true);
    expect(result.fact).toEqual({ acknowledgement: 'not-attempted', observation: 'paused', policyRevision: 0, sourceCurrentAtObservation: true });
    expect(f.ports.identifier).not.toHaveBeenCalled(); expect(f.events).toEqual(['diagnostics:read']);
});
it.each(['future', 'corrupt'] as const)('preserves %s policy state without attempting any native replacement', async state => {
    const f = collectionFixture(); vi.mocked(f.policies.execute).mockResolvedValue({ state });
    expect((await pauseCollectionPolicy(f.policies, 'recents', 3, f.ports.identifier, () => true)).observed).toEqual({ state });
    expect(f.policies.execute).toHaveBeenCalledTimes(1);
});
it('contains rejected native reads and does not guess the stored policy', async () => {
    const f = collectionFixture(); vi.mocked(f.policies.execute).mockRejectedValueOnce(new Error('native'));
    expect(await readCollectionPolicy(f.policies, 'recents')).toEqual({ state: 'unavailable' });
});
it('does not accept missing or foreign-kind policy data in a purported ready response', async () => {
    const f = collectionFixture(); vi.mocked(f.policies.execute).mockResolvedValueOnce({ state: 'ready', policy: undefined } as never)
        .mockResolvedValueOnce({ state: 'ready', policy: activeCollectionPolicy('recents') });
    expect(await readCollectionPolicy(f.policies, 'diagnostics')).toEqual({ state: 'corrupt' });
    expect(await readCollectionPolicy(f.policies, 'diagnostics')).toEqual({ state: 'corrupt' });
});
it('keeps an unexpected result or a throwing policy getter unavailable', async () => {
    const f = collectionFixture(); vi.mocked(f.policies.execute).mockResolvedValueOnce({ state: 'conflict' })
        .mockResolvedValueOnce({ state: 'ready', get policy(): CollectionPolicy { throw new Error('native'); } });
    expect(await readCollectionPolicy(f.policies, 'diagnostics')).toEqual({ state: 'unavailable' });
    expect(await readCollectionPolicy(f.policies, 'diagnostics')).toEqual({ state: 'unavailable' });
});
it('writes one restriction with exact CAS and observes its canonical receipt separately', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy());
    const result = await pauseCollectionPolicy(f.policies, 'diagnostics', 7, f.ports.identifier, () => true);
    expect(result.fact).toMatchObject({ acknowledgement: 'accepted', observation: 'paused', policyRevision: 2 });
    expect(result.observed).toMatchObject({ policy: { receipt: { settingsRevision: 7, beforeRevision: 1 } } });
    expect(f.events).toEqual(['diagnostics:read', 'diagnostics:set', 'diagnostics:read']);
});
it.each(['false', 'throws'])('does not submit a pause when the private source guard %s', async guard => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy());
    const current = () => { if (guard === 'throws') throw new Error('source'); return false; };
    const result = await pauseCollectionPolicy(f.policies, 'diagnostics', 1, f.ports.identifier, current);
    expect(result.fact).toMatchObject({ acknowledgement: 'not-attempted', observation: 'active', sourceCurrentAtObservation: false });
    expect(f.events).toEqual(['diagnostics:read']); expect(collectionCurrent(current)).toBe(false);
});
it.each(['invalid', 'throws'])('cannot submit a native write when the identifier provider is %s', async failure => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy());
    if (failure === 'throws') f.ports.identifier.mockImplementation(() => { throw new Error('entropy'); }); else f.ports.identifier.mockReturnValue('wrong');
    expect((await pauseCollectionPolicy(f.policies, 'diagnostics', 1, f.ports.identifier, () => true)).fact.acknowledgement).toBe('not-attempted');
    expect(f.events).toEqual(['diagnostics:read']);
});
it.each(['not-started', 'aborted', 'unknown'] as const)('keeps native %s acknowledgement separate from its independent active observation', async effect => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const execute = f.policies.execute;
    vi.mocked(execute).mockImplementationOnce(async () => ({ state: 'ready', policy: activeCollectionPolicy() }))
        .mockResolvedValueOnce({ state: 'unavailable', effect });
    expect((await pauseCollectionPolicy(f.policies, 'diagnostics', 1, f.ports.identifier, () => true)).fact)
        .toMatchObject({ acknowledgement: effect === 'unknown' ? 'unknown' : 'not-applied', observation: 'active', policyRevision: 1 });
    expect(execute).toHaveBeenCalledTimes(3);
});
it('observes a pause after a lost acknowledgement without converting that acknowledgement to accepted', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        const result = await execute(...args); if (args[1].type === 'set') throw new Error('acknowledgement-lost'); return result;
    });
    expect((await pauseCollectionPolicy(f.policies, 'diagnostics', 4, f.ports.identifier, () => true)).fact)
        .toMatchObject({ acknowledgement: 'unknown', observation: 'paused', policyRevision: 2 });
});
it('does not attribute a coincident pause to an operation rejected by CAS', async () => {
    const f = collectionFixture(); const active = activeCollectionPolicy(); f.values.set('diagnostics', active);
    vi.mocked(f.policies.execute).mockResolvedValueOnce({ state: 'ready', policy: active }).mockResolvedValueOnce({ state: 'conflict' })
        .mockResolvedValueOnce({ state: 'ready', policy: { ...active, revision: 2, mode: 'paused', receipt: { id: 'f'.repeat(32), beforeRevision: 1, settingsRevision: 1 } } });
    expect((await pauseCollectionPolicy(f.policies, 'diagnostics', 1, f.ports.identifier, () => true)).fact)
        .toMatchObject({ acknowledgement: 'not-applied', observation: 'paused', policyRevision: 2 });
});
it('retains an accepted transaction when canonical readback fails and never repeats the write', async () => {
    const f = collectionFixture(); const active = activeCollectionPolicy();
    vi.mocked(f.policies.execute).mockResolvedValueOnce({ state: 'ready', policy: active }).mockResolvedValueOnce({ state: 'written', policy: active })
        .mockRejectedValueOnce(new Error('readback'));
    expect((await pauseCollectionPolicy(f.policies, 'diagnostics', 1, f.ports.identifier, () => true)).fact)
        .toEqual({ acknowledgement: 'accepted', observation: 'unavailable', policyRevision: null, sourceCurrentAtObservation: true });
    expect(f.policies.execute).toHaveBeenCalledTimes(3);
});
it('records source retirement after the effect as an observation-time fact', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); let current = true;
    const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        const result = await execute(...args); if (args[1].type === 'set') current = false; return result;
    });
    expect((await pauseCollectionPolicy(f.policies, 'diagnostics', 4, f.ports.identifier, () => current)).fact)
        .toMatchObject({ acknowledgement: 'accepted', observation: 'paused', sourceCurrentAtObservation: false });
});
it('does not silently repeat an invalid reused operation identity', async () => {
    const f = collectionFixture(); const active = activeCollectionPolicy(); f.values.set('diagnostics', active); f.ports.identifier.mockReturnValue(active.receipt!.id);
    const result = await pauseCollectionPolicy(f.policies, 'diagnostics', 1, f.ports.identifier, () => true);
    expect(result.fact).toMatchObject({ acknowledgement: 'not-applied', observation: 'active' }); expect(f.events).toHaveLength(3);
});
it('accepts a native replay as acknowledgement without treating it as a new write', async () => {
    const f = collectionFixture(); const active = activeCollectionPolicy();
    vi.mocked(f.policies.execute).mockResolvedValueOnce({ state: 'ready', policy: active }).mockResolvedValueOnce({ state: 'replayed', policy: active })
        .mockResolvedValueOnce({ state: 'future' } satisfies CollectionPolicyResult);
    const result = await pauseCollectionPolicy(f.policies, 'diagnostics', 1, f.ports.identifier, () => true);
    expect(result.fact).toMatchObject({ acknowledgement: 'accepted', observation: 'unavailable' }); expect(result.observed).toEqual({ state: 'future' });
});
