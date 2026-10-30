import { afterEach, expect, it, vi } from 'vitest';
import { compoundGatewayFixture } from '../fixtures/compound_gateway.ts';
import { deferred } from '../fixtures/runtime.ts';
import { CENTER_SENDER } from '../fixtures/center.ts';
import type { CollectionSettled } from '../../src/domain/collection_review.ts';
import type { JournalSnapshot } from '../../src/domain/local_journal.ts';

const fixtures: Awaited<ReturnType<typeof compoundGatewayFixture>>[] = [];
const fixture = async (active = false) => { const f = await compoundGatewayFixture(active); fixtures.push(f); return f; };
afterEach(() => { for (const f of fixtures.splice(0)) { f.history.stop(); f.main.shutdown(); } });
it('the actual native preview creates a private-bound collection view with optional diagnostics off', async () => {
    const f = await fixture(); await f.preview(); expect(await f.current()).toMatchObject({ state: 'current', operation: { family: 'collection', stage: 'reviewed',
        fact: { action: 'start', collection: 'diagnostics' }, target: { location: { route: 'privacy' }, label: null }, retention: 'untracked' } }); expect(f.rows()).toHaveLength(0);
});
it('a metadata-only collection read performs no settings, journal, provider or permission I/O', async () => {
    const f = await fixture(); await f.preview(); const counts = [vi.mocked(f.port.get).mock.calls.length, vi.mocked(f.journals.execute).mock.calls.length,
        vi.mocked(f.sessions.reader.read).mock.calls.length, vi.mocked(f.browser.api.permissions.contains).mock.calls.length];
    await f.current(); await f.current(); expect([vi.mocked(f.port.get).mock.calls.length, vi.mocked(f.journals.execute).mock.calls.length,
        vi.mocked(f.sessions.reader.read).mock.calls.length, vi.mocked(f.browser.api.permissions.contains).mock.calls.length]).toEqual(counts);
});
it('enabling diagnostics cannot retrospectively retain its own preview or completion observed while off', async () => {
    const f = await fixture(); const preview = await f.preview(); expect(await f.confirm(preview.operationId)).toMatchObject({ reason: 'done' });
    await f.history.refresh(); await f.history.writer.flush(); expect(f.rows()).toHaveLength(0);
    expect(await f.current()).toMatchObject({ operation: { stage: 'settled', retention: 'untracked', fact: { activation: { attributed: true } } } });
});
it('an admitted stop preserves one same-row compound history record while its own collection becomes off', async () => {
    const f = await fixture(true); const preview = await f.preview('stop'); await f.history.writer.flush(); expect(f.rows()).toHaveLength(1);
    expect(await f.confirm(preview.operationId)).toMatchObject({ reason: 'done' }); await f.history.refresh(); await f.history.writer.flush();
    expect(f.rows()).toHaveLength(1); expect(f.rows()[0].fact).toMatchObject({ kind: 'collection-operation', state: 'settled',
        preference: { observation: 'committed' }, pause: { observation: 'paused', attributed: true }, activation: { phase: 'not-observed' } });
    expect(await f.current()).toMatchObject({ operation: { retention: 'stored' } }); expect(JSON.stringify(f.rows())).not.toContain(preview.operationId);
});
it('failed secondary history leaves canonical privacy effects and the current operation intact without a retry', async () => {
    const f = await fixture(true); vi.mocked(f.journals.execute).mockRejectedValue(new Error('private quota'));
    const preview = await f.preview('stop'); expect(await f.confirm(preview.operationId)).toMatchObject({ reason: 'done' }); await f.history.refresh(); await f.history.writer.flush();
    expect(await f.current()).toMatchObject({ operation: { stage: 'settled', fact: { preferenceVerifiedAtObservation: true, pause: { attributed: true } } } });
    expect(vi.mocked(f.policies.execute).mock.calls.filter(([, command]) => command.type === 'set')).toHaveLength(1); expect(f.port.set).toHaveBeenCalledOnce();
});
it('unknown append identity is not guessed from a coincident stored preview, and later phases cannot append another row', async () => {
    const f = await fixture(true); const execute = vi.mocked(f.journals.execute).getMockImplementation()!;
    vi.mocked(f.journals.execute).mockImplementation(async (...args) => { const result = await execute(...args); return args[1].type === 'append' ? { state: 'unavailable', effect: 'unknown' } : result; });
    const preview = await f.preview('stop'); await f.history.writer.flush(); await f.confirm(preview.operationId); await f.history.refresh(); await f.history.writer.flush();
    expect(vi.mocked(f.journals.execute).mock.calls.filter(([, command]) => command.type === 'append')).toHaveLength(1);
    expect(await f.current()).toMatchObject({ operation: { stage: 'settled', retention: 'unknown' } });
});
it('an old compound completion cannot overwrite a newer preference review or obtain its ticket', async () => {
    const f = await fixture(); const preview = await f.preview(); const gate = deferred<void>(); const entered = deferred<void>(); const set = vi.mocked(f.port.set).getMockImplementation()!;
    vi.mocked(f.port.set).mockImplementationOnce(async (...args) => { entered.resolve(); await gate.promise; await set(...args); });
    const pending = f.confirm(preview.operationId); await entered.promise;
    expect(await f.call({ ...f.owner, method: 'center.preview', expectedRevision: 0, intent: { type: 'preferences', values: { locale: 'es' } } })).toMatchObject({ state: 'preview' });
    gate.resolve(); expect(await pending).toMatchObject({ reason: 'done' }); expect(await f.current()).toMatchObject({ operation: { family: 'settings', stage: 'reviewed' } });
});
it('another native controller retires the old current entry without rebuilding it from retained history', async () => {
    const f = await fixture(true); await f.preview('stop'); await f.history.writer.flush(); const sender = { ...CENTER_SENDER, documentId: 'replacement', tab: { id: 2, incognito: false } };
    const other = await f.open(sender); await f.call({ clientId: other.clientId, controllerEpoch: other.controllerEpoch, method: 'center.claim' }, sender);
    expect(await f.current()).toEqual({ state: 'empty' }); expect(f.rows()).toHaveLength(1);
});
it('canonical clear generation retires the compound ticket and later completion cannot recreate it', async () => {
    const f = await fixture(true); const preview = await f.preview('stop'); await f.history.writer.flush();
    const before = f.documents.get('diagnostics') as JournalSnapshot;
    const cleared = { ...before, epoch: before.epoch + 1, revision: before.revision + 1, nextSequence: 1, entries: [] }; f.documents.set('diagnostics', cleared); f.history.writer.observe('diagnostics', cleared);
    await f.confirm(preview.operationId); await f.history.refresh(); await f.history.writer.flush(); expect(f.rows()).toHaveLength(0);
    expect(await f.current()).toMatchObject({ operation: { stage: 'settled', retention: 'untracked' } });
});
it('an unconfirmed off preference may complete with an inspected pause while the retained current service reason stays independent', async () => {
    const f = await fixture(true); const preview = await f.preview('stop'); vi.mocked(f.port.set).mockResolvedValueOnce(undefined);
    const result = await f.confirm(preview.operationId) as CollectionSettled; expect(result.preference.state).toBe('unknown');
    expect(await f.current()).toMatchObject({ operation: { fact: { result: 'preference-unconfirmed', pause: { attributed: true }, preference: { observation: 'unchanged' } } } });
});
