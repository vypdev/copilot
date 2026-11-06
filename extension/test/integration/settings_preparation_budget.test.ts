import { expect, it, vi } from 'vitest';
import { SETTINGS_OWNER as OWNER, settingsOperationsFixture } from '../fixtures/settings_operations.ts';
import { deferred } from '../fixtures/runtime.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import type { SettingsPreview } from '../../src/application/settings_transaction_ports.ts';

const change = { type: 'preferences', values: { density: 'compact' } };
it('sixteen suspended preparations reject overflow immediately without another native inspection', async () => {
    const h = settingsOperationsFixture(); const gate = deferred<void>(); const inspect = h.repository.inspect.bind(h.repository);
    const reads = vi.spyOn(h.repository, 'inspect').mockImplementation(async () => { await gate.promise; return inspect(); });
    const pending = Array.from({ length: 16 }, () => h.operations.preview(change, OWNER));
    let observed: SettingsPreview | undefined; const overflow = h.operations.preview(change, OWNER).then(value => { observed = value; return value; });
    try { await Promise.resolve(); expect(observed).toEqual({ state: 'busy' }); expect(reads).toHaveBeenCalledTimes(16); }
    finally { gate.resolve(); await Promise.all([...pending, overflow]); }
    expect(h.port.set).not.toHaveBeenCalled();
});
it('a prepared preview transfers one reserved slot and cancellation makes precisely that capacity reusable', async () => {
    const h = settingsOperationsFixture(); const gate = deferred<void>(); const inspect = h.repository.inspect.bind(h.repository); let calls = 0;
    const reads = vi.spyOn(h.repository, 'inspect').mockImplementation(async () => { if (++calls <= 15) await gate.promise; return inspect(); });
    const pending = Array.from({ length: 15 }, () => h.operations.preview(change, OWNER));
    try {
        const retained = await h.operations.preview(change, OWNER); if (retained.state !== 'preview') throw new Error('expected sixteenth slot');
        expect(await h.operations.preview(change, OWNER)).toEqual({ state: 'busy' }); expect(reads).toHaveBeenCalledTimes(16);
        expect(h.operations.cancel(retained.operationId, retained.revision, OWNER)).toEqual({ state: 'cancelled' });
        expect(await h.operations.preview(change, OWNER)).toMatchObject({ state: 'preview' }); expect(reads).toHaveBeenCalledTimes(17);
    } finally { gate.resolve(); await Promise.all(pending); }
    expect(h.port.set).not.toHaveBeenCalled();
});
it('invalidation retires old preparations without pretending their outstanding native work has already released capacity', async () => {
    const h = settingsOperationsFixture(); const gate = deferred<void>(); const inspect = h.repository.inspect.bind(h.repository);
    vi.spyOn(h.repository, 'inspect').mockImplementation(async () => { await gate.promise; return inspect(); });
    const pending = Array.from({ length: 16 }, () => h.operations.preview(change, OWNER)); h.operations.invalidate();
    let observed: SettingsPreview | undefined; const overflow = h.operations.preview(change, OWNER).then(value => { observed = value; return value; });
    try { await Promise.resolve(); expect(observed).toEqual({ state: 'busy' }); }
    finally { gate.resolve(); await overflow; }
    expect((await Promise.all(pending)).every(result => result.state === 'stale')).toBe(true);
    expect(await h.operations.preview(change, OWNER)).toMatchObject({ state: 'preview' }); expect(h.port.set).not.toHaveBeenCalled();
});
it.each(['invalid', 'read-failed', 'future', 'conflict', 'unchanged', 'identifier-failed'] as const)('the %s exit releases a preparation reservation before the next request', async failure => {
    const h = settingsOperationsFixture(); let intent: unknown = change; let revision = 0; let state = 'unavailable';
    if (failure === 'invalid') { intent = null; state = 'invalid'; }
    if (failure === 'read-failed') vi.spyOn(h.repository, 'inspect').mockRejectedValue(new Error('private-native-detail'));
    if (failure === 'future') { h.values.set(SETTINGS_KEY, { schemaVersion: 99 }); state = 'future'; }
    if (failure === 'conflict') { revision = 1; state = 'conflict'; }
    if (failure === 'unchanged') { intent = { type: 'preferences', values: { density: 'comfortable' } }; state = 'unchanged'; }
    if (failure === 'identifier-failed') h.ports.identifier.mockImplementation(() => { throw new Error('private-id-detail'); });
    for (let index = 0; index < 18; index++) expect(await h.operations.preview(intent, OWNER, revision)).toMatchObject({ state });
    expect(h.port.set).not.toHaveBeenCalled();
});
