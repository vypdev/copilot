import { expect, it, vi } from 'vitest';
import { nativeSessionVaultFixture as fixture } from '../fixtures/native_session_vault.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/native_session_vault.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { purposeVault, readRoleVault } from '../fixtures/credential_roles.ts';
import { CONNECTED, deferred } from '../fixtures/runtime.ts';

it('native inspection preserves known schema2 with detached protected credentials and makes no repair write', async () => {
    const h = fixture(); const before = await h.read(); expect(before).toEqual({ present: true, vault: purposeVault() });
    expect(Object.isFrozen(before.vault.entries[0].connection)).toBe(true); expect(h.port.set).not.toHaveBeenCalled(); expect(h.port.remove).not.toHaveBeenCalled();
});
it.each(['empty', 'legacy', 'invalid-legacy'] as const)('an absent named vault reads the %s H2 boundary without persisting a migration', async kind => {
    const h = fixture(false); if (kind !== 'empty') h.values.set(SESSION_KEY, kind === 'legacy' ? CONNECTED : { ...CONNECTED, viewerId: '0' });
    expect(await h.read()).toMatchObject({ present: false, vault: { schemaVersion: 1, selected: kind === 'legacy' ? 'previous-session' : null } });
    expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['unprotected', 'future', 'corrupt', 'throwing-get'] as const)('a %s native vault is unavailable and preserved', async kind => {
    const h = fixture(); if (kind === 'unprotected') h.protection.mockResolvedValue(false);
    if (kind === 'future') h.values.set(NAMED_SESSIONS_KEY, { schemaVersion: 9 }); if (kind === 'corrupt') h.values.set(NAMED_SESSIONS_KEY, {});
    if (kind === 'throwing-get') vi.mocked(h.port.get).mockRejectedValueOnce(new Error('private native storage failure'));
    const before = structuredClone(h.values.get(NAMED_SESSIONS_KEY)); await expect(h.read()).rejects.toThrow();
    expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(before); expect(h.port.set).not.toHaveBeenCalled(); expect(h.port.remove).not.toHaveBeenCalled();
});
it('a schema1 vault remains a known read-only snapshot rather than an automatic schema2 upgrade', async () => {
    const h = fixture(); h.values.set(NAMED_SESSIONS_KEY, readRoleVault()); expect(await h.read()).toEqual({ present: true, vault: readRoleVault() }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['accepted-matching', 'lost-matching', 'accepted-different', 'lost-different', 'accepted-unavailable', 'lost-unavailable'] as const)('a %s native save keeps acknowledgement and canonical readback independent', async kind => {
    const h = fixture(); const before = await h.read(); const save = vi.mocked(h.port.set).getMockImplementation()!;
    const set = vi.mocked(h.port.set).mockImplementation(async (key, value) => {
        if (kind.endsWith('matching')) await save(key, value);
        if (kind.endsWith('unavailable')) vi.mocked(h.port.get).mockRejectedValueOnce(new Error('private readback failure'));
        if (kind.startsWith('lost')) throw new Error('lost acknowledgement');
    });
    expect(await h.owner.save(before, h.proposed, h.current)).toEqual({ state: 'saved', candidate: h.proposed, fact: { acknowledgement: kind.startsWith('lost') ? 'unknown' : 'accepted',
        observation: kind.endsWith('matching') ? 'committed' : kind.endsWith('different') ? 'different' : 'unavailable' } }); expect(set).toHaveBeenCalledTimes(1);
});
it.each(['initial', 'protection', 'canonical-read', 'observer'] as const)('source loss at %s prevents the native write and cannot create a submitted effect', async stage => {
    const h = fixture(); const before = await h.read(); vi.mocked(h.port.get).mockClear(); const read = vi.mocked(h.port.get).getMockImplementation()!;
    if (stage === 'initial') h.current.mockReturnValue(false);
    if (stage === 'protection') h.protection.mockImplementationOnce(async () => { h.current.mockReturnValue(false); return true; });
    if (stage === 'canonical-read') vi.mocked(h.port.get).mockImplementationOnce(async key => { const value = await read(key); h.current.mockReturnValue(false); return value; });
    const trace = vi.fn(() => { if (stage === 'observer') h.current.mockReturnValue(false); return null; });
    expect(await h.owner.save(before, h.proposed, h.current, trace)).toEqual({ state: 'stale' }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['unprotected', 'truthy-protection', 'throwing-protection', 'throwing-preflight'] as const)('failed %s admission cannot persist or fall back to another native key', async kind => {
    const h = fixture(); const before = await h.read();
    if (kind === 'unprotected' || kind === 'truthy-protection') h.protection.mockResolvedValue((kind === 'unprotected' ? false : 'yes') as boolean);
    if (kind === 'throwing-protection') h.protection.mockRejectedValueOnce(new Error('private protection failure'));
    if (kind === 'throwing-preflight') vi.mocked(h.port.get).mockRejectedValueOnce(new Error('private preflight failure'));
    expect(await h.owner.save(before, h.proposed, h.current)).toEqual({ state: 'unavailable' }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['newer-vault', 'future-vault', 'removed-vault', 'created-vault'] as const)('a %s after the original observation is never overwritten by the older candidate', async kind => {
    const h = fixture(kind !== 'created-vault'); const before = await h.read();
    if (kind === 'removed-vault') h.values.delete(NAMED_SESSIONS_KEY);
    else h.values.set(NAMED_SESSIONS_KEY, kind === 'future-vault' ? { schemaVersion: 9 } : { ...purposeVault(), revision: 6 });
    const newer = structuredClone(h.values.get(NAMED_SESSIONS_KEY)); expect(await h.owner.save(before, { ...h.proposed, revision: before.vault.revision + 1 }, h.current)).toEqual({ state: 'conflict' });
    expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(newer); expect(h.port.set).not.toHaveBeenCalled();
});
it('the first explicit save may materialize an absent vault, while invalid proposed state never reaches native admission', async () => {
    const h = fixture(false); const before = await h.read(); expect(await h.owner.save(before, { ...h.proposed, revision: 1 }, h.current)).toMatchObject({ state: 'saved', fact: { observation: 'committed' } });
    vi.mocked(h.port.set).mockClear(); h.protection.mockClear(); expect(await h.owner.save(before, { ...h.proposed, schemaVersion: 9 } as unknown as typeof h.proposed, h.current)).toEqual({ state: 'unavailable' });
    expect(await h.owner.save(before, null, h.current)).toEqual({ state: 'unavailable' });
    expect(h.protection).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('one queue makes competing stale observations conflict rather than overwriting a completed selection', async () => {
    const h = fixture(); const before = await h.read(); const first = h.owner.save(before, h.proposed, h.current);
    const second = h.owner.save(before, { ...h.proposed, writeSelections: { 'issues-write': null, 'actions-write': 'actions' } }, h.current);
    expect(await first).toMatchObject({ state: 'saved', fact: { observation: 'committed' } }); expect(await second).toEqual({ state: 'conflict' });
    expect(h.port.set).toHaveBeenCalledTimes(1); expect(h.values.get(NAMED_SESSIONS_KEY)).toEqual(h.proposed);
});
it('queued forgetting runs after an admitted native write and cannot let its late completion resurrect credentials', async () => {
    const h = fixture(); const before = await h.read(); const entered = deferred<void>(); const release = deferred<void>(); const set = vi.mocked(h.port.set).getMockImplementation()!;
    vi.mocked(h.port.set).mockImplementation(async (key, value) => { entered.resolve(); await release.promise; await set(key, value); });
    const writing = h.owner.save(before, h.proposed, h.current); await entered.promise; const forgetting = h.owner.forget();
    expect(h.port.remove).not.toHaveBeenCalled(); release.resolve(); expect(await writing).toMatchObject({ state: 'saved' });
    expect(await forgetting).toEqual({ acknowledgement: 'accepted', observation: 'committed' }); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false);
});
it.each(['accepted', 'lost'] as const)('explicit forgetting verifies absence after %s acknowledgement without requiring readable schema or protection', async acknowledgement => {
    const h = fixture(); h.values.set(NAMED_SESSIONS_KEY, { schemaVersion: 9 }); h.protection.mockResolvedValue(false); const remove = vi.mocked(h.port.remove).getMockImplementation()!;
    vi.mocked(h.port.remove).mockImplementation(async key => { await remove(key); if (acknowledgement === 'lost') throw new Error('lost remove acknowledgement'); });
    expect(await h.owner.forget()).toEqual({ acknowledgement: acknowledgement === 'lost' ? 'unknown' : 'accepted', observation: 'committed' });
    expect(h.protection).not.toHaveBeenCalled(); expect(h.port.remove).toHaveBeenCalledTimes(1);
});
it('an unconfirmed native removal stays different and is never retried automatically', async () => {
    const h = fixture(); vi.mocked(h.port.remove).mockResolvedValueOnce(); expect(await h.owner.forget()).toEqual({ acknowledgement: 'accepted', observation: 'different' });
    expect(h.port.remove).toHaveBeenCalledTimes(1); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(true);
});
it.each(['skipped-revision', 'schema-downgrade'] as const)('a %s cannot become an admitted canonical save', async kind => {
    const h = fixture(); const before = await h.read(); h.protection.mockClear();
    const next = kind === 'skipped-revision' ? { ...h.proposed, revision: 6 } : { ...readRoleVault(), revision: 5 };
    expect(await h.owner.save(before, next, h.current)).toEqual({ state: 'unavailable' }); expect(h.protection).not.toHaveBeenCalled(); expect(h.port.set).not.toHaveBeenCalled();
});
it('failure of an optional observer cannot prevent an otherwise verified native save', async () => {
    const h = fixture(); const before = await h.read(); expect(await h.owner.save(before, h.proposed, h.current, () => { throw new Error('private observer failure'); }))
        .toMatchObject({ state: 'saved', fact: { acknowledgement: 'accepted', observation: 'committed' } }); expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('native removal failure remains an observed fact and cannot poison the queue for a later separately reviewed save', async () => {
    const h = fixture(); const before = await h.read(); vi.mocked(h.port.remove).mockRejectedValueOnce(new Error('native removal unavailable'));
    expect(await h.owner.forget()).toEqual({ acknowledgement: 'unknown', observation: 'different' }); expect(h.port.remove).toHaveBeenCalledTimes(1);
    expect(await h.owner.save(before, h.proposed, h.current)).toMatchObject({ state: 'saved', fact: { acknowledgement: 'accepted', observation: 'committed' } });
    expect(h.port.remove).toHaveBeenCalledTimes(1); expect(h.port.set).toHaveBeenCalledTimes(1);
});
