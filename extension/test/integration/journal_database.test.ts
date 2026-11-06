import { expect, it } from 'vitest';
import { openJournalDatabase } from '../../src/adapters/browser/journal_database.ts';
import { JournalNative } from '../fixtures/journal_native.ts';

it('creates exactly the three empty owned stores for native version0', async () => {
    const native = new JournalNative(); native.names.length = 0; const result = openJournalDatabase(native.factory);
    native.upgrade({ abort() { throw new Error('unexpected'); } }); native.opened();
    expect(await result).toBe(native.database); expect(native.created).toEqual(['diagnostics', 'recents', 'policy']);
    expect(native.opens[0]).toMatchObject({ name: 'copilot.generated-history.v1', version: 2 }); expect(native.deletions).toEqual([]);
});
it('known version1 adds only policy and preserves both legacy values byte-for-byte without a data transaction', async () => {
    const native = new JournalNative(); native.names.splice(0, 3, 'diagnostics', 'recents');
    const diagnostics = { schemaVersion: 99, retained: ['preserve-unrecognized-data'] }; const recents = { schemaVersion: 1, arbitrary: 'preserve' };
    native.data.set('diagnostics', diagnostics); native.data.set('recents', recents); const before = JSON.stringify([...native.data]);
    const result = openJournalDatabase(native.factory); native.upgrade({ abort() { throw new Error('unexpected'); } }, 0, 1); native.opened();
    expect(await result).toBe(native.database); expect(native.created).toEqual(['policy']); expect(native.deletions).toEqual([]);
    expect(JSON.stringify([...native.data])).toBe(before); expect(native.transactions).toHaveLength(0);
});
it.each(['missing', 'foreign', 'extra'] as const)('does not repair a %s version1 layout', async condition => {
    const native = new JournalNative(); native.names.splice(0, 3, 'diagnostics', 'recents');
    if (condition === 'missing') native.names.pop(); else if (condition === 'foreign') native.names[1] = 'notes'; else native.names.push('notes');
    let aborted = false; const result = openJournalDatabase(native.factory); native.upgrade({ abort() { aborted = true; } }, 0, 1);
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' }); expect(aborted).toBe(true);
    expect(native.created).toEqual([]); expect(native.deletions).toEqual([]);
});
it('rejects an unexpected upgrade origin instead of rewriting its records', async () => {
    const native = new JournalNative(); const result = openJournalDatabase(native.factory); let aborted = false;
    native.upgrade({ abort() { aborted = true; } }, 0, 2); expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' });
    expect(aborted).toBe(true); expect(native.created).toEqual([]); expect(native.deletions).toEqual([]);
});
it('contains a native store-creation exception and does not resume the failed command', async () => {
    const native = new JournalNative(); native.names.length = 0; native.throwCreate = true;
    const result = openJournalDatabase(native.factory); let aborted = false; native.upgrade({ abort() { aborted = true; } });
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' }); expect(aborted).toBe(true);
    native.opened(); expect(native.closeCount).toBe(1); expect(native.transactions).toEqual([]);
});
it('an already blocked operation cannot later perform an abandoned upgrade', async () => {
    const native = new JournalNative(); native.names.length = 0; const result = openJournalDatabase(native.factory); native.blocked();
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' }); let aborted = false;
    native.upgrade({ abort() { aborted = true; } }); native.opened(); expect(aborted).toBe(true);
    expect(native.created).toEqual([]); expect(native.closeCount).toBe(1);
});
it('does not hang if the native upgrade request lacks an abortable transaction', async () => {
    const native = new JournalNative(); const result = openJournalDatabase(native.factory);
    native.upgrade(null as never); expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' });
});
it('maps a newer database to future and other native failures to unavailable without deletion', async () => {
    for (const name of ['VersionError', 'UnknownError']) {
        const native = new JournalNative(); const result = openJournalDatabase(native.factory); native.failed(name);
        expect(await result).toEqual(name === 'VersionError' ? { state: 'future' } : { state: 'unavailable', effect: 'not-started' });
        expect(native.deletions).toEqual([]);
    }
});
it('contains unreadable or absent native error metadata without returning a raw exception', async () => {
    for (const throws of [true, false]) {
        const native = new JournalNative(); const result = openJournalDatabase(native.factory); const request = native.opens[0].request;
        Object.defineProperty(request, 'error', throws ? { get() { throw new Error('private'); } } : { value: null });
        request.onerror?.call(request, {} as Event); expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' });
    }
});
it('contains an unreadable native success result before any database handle exists', async () => {
    const native = new JournalNative(); const result = openJournalDatabase(native.factory); const request = native.opens[0].request;
    Object.defineProperty(request, 'result', { get() { throw new Error('private'); } }); request.onsuccess?.call(request, {} as Event);
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' }); expect(native.closeCount).toBe(0);
});
it('closes an obtained connection whose native layout cannot be inspected', async () => {
    const native = new JournalNative(); const result = openJournalDatabase(native.factory); const request = native.opens[0].request;
    const unreadable = new Proxy(native.database, { get(target, key, receiver) {
        if (key === 'objectStoreNames') throw new Error('private-layout'); return Reflect.get(target, key, receiver);
    } });
    Object.defineProperty(request, 'result', { value: unreadable }); request.onsuccess?.call(request, {} as Event);
    expect(await result).toEqual({ state: 'unavailable', effect: 'not-started' }); expect(native.closeCount).toBe(1);
});
it('native open rejection is left to the semantic adapter without inventing a submitted transaction', async () => {
    const native = new JournalNative(); native.throwOpen = true;
    await expect(openJournalDatabase(native.factory)).rejects.toThrow('native-private-error'); expect(native.transactions).toHaveLength(0);
});
