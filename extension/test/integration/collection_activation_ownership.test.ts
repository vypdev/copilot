import { expect, it } from 'vitest';
import { decideCollectionPolicy, type CollectionPolicy } from '../../src/domain/collection_policy.ts';
import { collectionFixture, collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';

const ID = 'd'.repeat(32);
const activated = (settingsRevision = 0) => {
    const result = decideCollectionPolicy('diagnostics', undefined, { type: 'set', expectedRevision: 0, mode: 'active', operationId: ID, settingsRevision });
    if (!result.write) throw new Error('bad-fixture'); return result.write;
};
it('requires known opted-in preferences, exact kind witness, exact policy/settings revisions and a native identity', async () => {
    const f = collectionFixture(collectionSettings(true)); expect(f.coordinator.capture('diagnostics')).toBeNull(); await f.coordinator.refresh();
    const witness = f.coordinator.capture('diagnostics')!; expect(Object.isFrozen(witness)).toBe(true);
    expect(f.coordinator.reserveActivation('diagnostics', witness.stamp, 0, 0, 'bad')).toBeNull();
    expect(f.coordinator.reserveActivation('diagnostics', {}, 0, 0, ID)).toBeNull();
    expect(f.coordinator.reserveActivation('diagnostics', witness.stamp, 1, 0, ID)).toBeNull();
    expect(f.coordinator.reserveActivation('diagnostics', witness.stamp, 0, 1, ID)).toBeNull();
    const off = f.coordinator.capture('recents')!; expect(f.coordinator.reserveActivation('recents', off.stamp, 0, 0, ID)).toBeNull();
});
it('global pause and a policy unable to advance safely cannot acquire activation authority', async () => {
    const f = collectionFixture({ ...collectionSettings(true), paused: true }); await f.coordinator.refresh(); const paused = f.coordinator.capture('diagnostics')!;
    expect(f.coordinator.reserveActivation('diagnostics', paused.stamp, 0, 0, ID)).toBeNull();
    const g = collectionFixture(collectionSettings(true)); const active = activeCollectionPolicy(); const revision = Number.MAX_SAFE_INTEGER - 1;
    g.values.set('diagnostics', { ...active, revision, receipt: { ...active.receipt!, beforeRevision: revision - 1 } }); await g.coordinator.refresh();
    expect(g.coordinator.reserveActivation('diagnostics', g.coordinator.capture('diagnostics')!.stamp, 0, revision, ID)).toBeNull();
});
it('accepts only the exact observed native receipt under both the source and the owned activation lease', async () => {
    const f = collectionFixture(collectionSettings(true)); await f.coordinator.refresh(); const witness = f.coordinator.capture('diagnostics')!;
    const held = f.coordinator.reserveActivation('diagnostics', witness.stamp, 0, 0, ID)!; const policy = activated();
    expect(held.accept(policy, () => false)).toBe(false); expect(held.accept(policy, () => { throw new Error('source'); })).toBe(false);
    expect(held.accept({ ...policy, mode: 'paused' }, () => true)).toBe(false);
    expect(held.accept({ ...policy, revision: 2, receipt: { ...policy.receipt!, beforeRevision: 1 } }, () => true)).toBe(false);
    expect(held.accept({ ...policy, receipt: { ...policy.receipt!, id: 'e'.repeat(32) } }, () => true)).toBe(false);
    expect(held.accept({ ...policy, receipt: { ...policy.receipt!, settingsRevision: 1 } }, () => true)).toBe(false);
    expect(held.accept({ ...policy, schemaVersion: 99 } as unknown as CollectionPolicy, () => true)).toBe(false);
    expect(held.accept(policy, () => true)).toBe(true); expect(f.coordinator.admission('diagnostics')).toBeNull();
    f.values.set('diagnostics', policy); held.release(); await f.coordinator.refresh(); expect(f.coordinator.admission('diagnostics')?.current()).toBe(true);
});
it('a retired admission witness cannot clear a newer stop and an old release cannot unlock its replacement', async () => {
    const f = collectionFixture(collectionSettings(true)); await f.coordinator.refresh(); const witness = f.coordinator.capture('diagnostics')!;
    const held = f.coordinator.reserveActivation('diagnostics', witness.stamp, 0, 0, ID)!; const newer = f.coordinator.pause('diagnostics');
    expect(f.coordinator.owns('diagnostics', witness.stamp)).toBe(false); expect(f.coordinator.owns('diagnostics', newer)).toBe(true);
    expect(held.current()).toBe(false); expect(held.accept(activated(), () => true)).toBe(false); held.release(); await f.coordinator.refresh();
    const next = f.coordinator.reserveActivation('diagnostics', newer, 0, 0, 'e'.repeat(32))!; held.release(); expect(next.current()).toBe(true);
    next.release(); next.release(); f.coordinator.dispose(); expect(f.coordinator.owns('diagnostics', newer)).toBe(false);
});
it('retains at most thirty-two scoped preparation receipts and consumes them without exposing preference snapshots', async () => {
    const f = collectionFixture(); const ids = [];
    for (let i = 0; i < 34; i++) { const id = (100 + i).toString(16).padStart(32, '0'); ids.push(id);
        const before = (await f.repository.read()).settings;
        expect((await f.repository.commit({ ...before, center: { ...before.center, diagnostics: !before.center.diagnostics } }, before.revision, id, () => true)).state).toBe('committed'); }
    expect(f.coordinator.takePreparation(ids[0])).toBeNull(); const receipt = f.coordinator.takePreparation(ids[33])!;
    expect(Object.keys(receipt)).toEqual(['diagnostics']); expect(Object.keys(receipt.diagnostics!).sort()).toEqual(['afterStamp', 'beforeStamp', 'result']);
    expect(receipt.diagnostics!.beforeStamp).not.toBe(receipt.diagnostics!.afterStamp); expect(f.coordinator.takePreparation(ids[33])).toBeNull();
});
