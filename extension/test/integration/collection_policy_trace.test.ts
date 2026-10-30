import { expect, it, vi } from 'vitest';
import { pauseCollectionPolicy } from '../../src/application/collection_restrictions.ts';
import { collectionFixture } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { CollectionPolicyResult } from '../../src/domain/collection_policy.ts';

it('reports actual command invocation before submission and canonical inspection before the closed observed fact', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy());
    const submitted = vi.fn(() => { expect(f.events.at(-1)).toBe('diagnostics:set'); });
    const observed = vi.fn(() => { expect(f.events.at(-1)).toBe('diagnostics:read'); });
    const value = await pauseCollectionPolicy(f.policies, 'diagnostics', 3, f.ports.identifier, () => true, { submitted, observed });
    expect(submitted).toHaveBeenCalledOnce(); expect(observed).toHaveBeenCalledExactlyOnceWith({ acknowledgement: 'accepted', observation: 'paused', revision: 2, attributed: true });
    expect(value.attributed).toBe(true); expect(JSON.stringify(observed.mock.calls)).not.toContain(value.operationId);
});
it('an already paused inspection emits no invented submission or attributed receipt', async () => {
    const f = collectionFixture(); const submitted = vi.fn(); const observed = vi.fn();
    const value = await pauseCollectionPolicy(f.policies, 'recents', 1, f.ports.identifier, () => true, { submitted, observed });
    expect(submitted).not.toHaveBeenCalled(); expect(observed).toHaveBeenCalledExactlyOnceWith({ acknowledgement: 'not-attempted', observation: 'paused', revision: 0, attributed: false }); expect(value.attributed).toBe(false);
});
it('an unresolved native command remains submitted without premature canonical inspection', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const gate = deferred<CollectionPolicyResult>();
    const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation((...args) => args[1].type === 'set' ? gate.promise : execute(...args));
    const submitted = vi.fn(); const observed = vi.fn(); const pending = pauseCollectionPolicy(f.policies, 'diagnostics', 0, f.ports.identifier, () => true, { submitted, observed });
    await vi.waitFor(() => expect(submitted).toHaveBeenCalledOnce()); expect(f.events).toEqual(['diagnostics:read']); expect(observed).not.toHaveBeenCalled();
    gate.resolve({ state: 'unavailable', effect: 'unknown' }); expect((await pending).fact.acknowledgement).toBe('unknown'); expect(observed).toHaveBeenCalledOnce();
});
it.each(['sync', 'async', 'lost-ack'] as const)('a %s native failure still records one actual attempt and one independent inspection', async mode => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation((...args) => {
        if (args[1].type !== 'set') return execute(...args); if (mode === 'sync') throw new Error('private native failure');
        return (async () => { if (mode === 'lost-ack') await execute(...args); throw new Error('private acknowledgement'); })();
    });
    const submitted = vi.fn(); const observed = vi.fn(); const result = await pauseCollectionPolicy(f.policies, 'diagnostics', 0, f.ports.identifier, () => true, { submitted, observed });
    expect(submitted).toHaveBeenCalledOnce(); expect(observed).toHaveBeenCalledOnce(); expect(result.fact).toMatchObject({ acknowledgement: 'unknown', observation: mode === 'lost-ack' ? 'paused' : 'active' });
    expect(result.attributed).toBe(mode === 'lost-ack'); expect(vi.mocked(f.policies.execute).mock.calls.filter(([, command]) => command.type === 'set')).toHaveLength(1);
});
it.each(['submitted', 'observed'] as const)('a failing secondary %s callback cannot change primary native facts or trigger a retry', async event => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const submitted = vi.fn(); const observed = vi.fn();
    const fail = () => { throw new Error('secondary'); }; if (event === 'submitted') submitted.mockImplementation(fail); else observed.mockImplementation(fail);
    const result = await pauseCollectionPolicy(f.policies, 'diagnostics', 0, f.ports.identifier, () => true, { submitted, observed });
    expect(result).toMatchObject({ attributed: true, fact: { acknowledgement: 'accepted', observation: 'paused' } }); expect(f.policies.execute).toHaveBeenCalledTimes(3);
});
it('observed values are detached, frozen and stripped of private selectors before a callback receives them', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy());
    const observed = vi.fn(value => { expect(Object.keys(value).sort()).toEqual(['acknowledgement', 'attributed', 'observation', 'revision']);
        expect(Object.isFrozen(value)).toBe(true); Object.defineProperty(value, 'attributed', { value: false }); });
    const result = await pauseCollectionPolicy(f.policies, 'diagnostics', 0, f.ports.identifier, () => true, { submitted() {}, observed });
    expect(result.attributed).toBe(true); expect(result.observed.state).toBe('ready'); expect(observed).toHaveBeenCalledOnce();
});
it('a failed directly supplied preflight observer factory cannot prevent a canonical preference save or bypass the prerequisite pause', async () => {
    const f = collectionFixture(); f.values.set('diagnostics', activeCollectionPolicy()); const before = (await f.repository.read()).settings;
    const observe = vi.fn(() => { throw new Error('secondary factory'); });
    expect(await f.repository.commit({ ...before, center: { ...before.center, diagnostics: true } }, 0, 'f'.repeat(32), () => true, undefined, observe)).toMatchObject({ state: 'committed' });
    expect(observe).toHaveBeenCalledExactlyOnceWith('diagnostics'); expect(f.events.filter(value => value.endsWith(':set'))).toEqual(['diagnostics:set', 'preferences:set']);
    expect(f.coordinator.state('diagnostics').collecting).toBe(false);
});
