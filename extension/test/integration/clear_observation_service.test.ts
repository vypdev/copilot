import { expect, it, vi } from 'vitest';
import { clearObserverFixture as fixture } from '../fixtures/clear_observer.ts';
import { clearPreview, JOURNAL_OWNER } from '../fixtures/journal_reviews.ts';
import { NOW } from '../fixtures/local_journal.ts';
import { deferred } from '../fixtures/runtime.ts';
import { validClearFact } from '../../src/domain/clear_fact.ts';
import type { JournalResult } from '../../src/domain/local_journal.ts';

it('a retained clear exposes an actual attempt, native acknowledgement and independent empty-generation read', async () => {
    const f = fixture(); const preview = await clearPreview(f); expect(f.last().engine.fact.state).toBe('reviewed'); expect(f.snapshots).toHaveLength(0);
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toMatchObject({ state: 'observed-cleared' });
    expect(f.last().engine.fact).toMatchObject({ state: 'settled', result: 'observed-cleared', submitted: true, acknowledgement: 'accepted', observation: 'cleared', incomplete: false, sourceCurrentAtObservation: true });
    expect(f.snapshots.every(validClearFact)).toBe(true); expect(JSON.stringify(f.snapshots)).not.toMatch(/epoch|revision|operationId|owner/); expect(f.lease.release).toHaveBeenCalledOnce();
});
it('pending native execution is inspectable and duplicate confirmation shares exactly one in-flight attempt', async () => {
    const f = fixture(); const preview = await clearPreview(f); const gate = deferred<JournalResult>(); const entered = deferred<void>();
    const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementation((kind, command, ...rest) => { if (command.type === 'clear') { entered.resolve(); return gate.promise; } return execute(kind, command, ...rest); });
    const pending = f.reviews.confirm(preview.operationId, JOURNAL_OWNER); await entered.promise;
    expect(f.last().engine.fact).toMatchObject({ state: 'running', submitted: true, acknowledgement: 'unknown', observation: 'not-observed' });
    expect(f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toBe(pending); expect(f.reviews.cancel(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'pending' });
    gate.resolve({ state: 'unavailable', effect: 'unknown' }); expect(await pending).toMatchObject({ state: 'unknown', observation: 'changed' });
    expect(f.store.execute.mock.calls.filter(([, command]) => command.type === 'clear')).toHaveLength(1);
});
it('an accepted write stays visible while its separate canonical read is pending', async () => {
    const f = fixture(); const preview = await clearPreview(f); const gate = deferred<void>(); const entered = deferred<void>(); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementation(async (...args) => { if (args[1].type === 'read') { entered.resolve(); await gate.promise; } return execute(...args); });
    const pending = f.reviews.confirm(preview.operationId, JOURNAL_OWNER); await entered.promise;
    expect(f.last().engine.fact).toMatchObject({ state: 'running', submitted: true, acknowledgement: 'accepted', observation: 'not-observed' });
    gate.resolve(); await pending; expect(f.last().engine.fact.observation).toBe('cleared');
});
it.each(['lost-ack', 'sync-throw', 'async-throw'] as const)('a %s attempt is observed without resubmission or invented acceptance', async mode => {
    const f = fixture(); const preview = await clearPreview(f); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementation((...args) => {
        if (args[1].type !== 'clear') return execute(...args);
        if (mode === 'sync-throw') throw new Error('private native failure');
        if (mode === 'async-throw') return Promise.reject(new Error('private native failure'));
        return execute(...args).then(() => { throw new Error('private lost acknowledgement'); });
    });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toMatchObject({ state: mode === 'lost-ack' ? 'observed-cleared' : 'unknown', acknowledgement: 'unknown' });
    expect(f.last().engine.fact).toMatchObject({ submitted: true, acknowledgement: 'unknown', observation: mode === 'lost-ack' ? 'cleared' : 'changed', incomplete: false });
    expect(f.store.execute.mock.calls.filter(([, command]) => command.type === 'clear')).toHaveLength(1); expect(JSON.stringify(f.last().engine.fact)).not.toContain('private');
});
it.each(['not-started', 'aborted'] as const)('an explicit native %s response does not perform a reconciliation read', async effect => {
    const f = fixture(); const preview = await clearPreview(f); f.store.execute.mockResolvedValueOnce({ state: 'unavailable', effect });
    const count = f.store.execute.mock.calls.length;
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'not-applied', reason: effect });
    expect(f.store.execute).toHaveBeenCalledTimes(count + 1); expect(f.last().engine.fact).toMatchObject({ result: 'not-applied', acknowledgement: 'not-applied', observation: 'not-applied', notAppliedReason: effect, sourceCurrentAtObservation: null });
});
it.each(['stale', 'invalid', 'future', 'corrupt', 'clock-invalid', 'exhausted', 'collection-active'] as const)('native %s rejection cannot be represented as a canonical no-change read', async state => {
    const f = fixture(); const preview = await clearPreview(f); f.store.execute.mockResolvedValueOnce({ state });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state });
    expect(f.last().engine.fact).toMatchObject({ result: state, submitted: true, acknowledgement: 'not-applied', observation: 'unavailable', sourceCurrentAtObservation: null });
});
it('an unexpected native ready response is uncertain rather than evidence of a successful clear', async () => {
    const f = fixture(); const preview = await clearPreview(f); f.store.execute.mockResolvedValueOnce({ state: 'ready', snapshot: f.documents.get('diagnostics') } as never);
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'unavailable' });
    expect(f.last().engine.fact).toMatchObject({ result: 'unavailable', acknowledgement: 'unknown', observation: 'unavailable' });
});
it.each(['unavailable', 'changed', 'thrown'] as const)('a %s canonical read cannot erase the accepted native write', async mode => {
    const f = fixture(); const preview = await clearPreview(f); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementation(async (...args) => {
        if (args[1].type !== 'read') return execute(...args);
        if (mode === 'thrown') throw new Error('private read failure');
        if (mode === 'unavailable') return { state: 'unavailable', effect: 'not-started' };
        const value = f.documents.get('diagnostics') as object; return { state: 'ready', snapshot: { ...value, epoch: 0 } } as never;
    });
    await f.reviews.confirm(preview.operationId, JOURNAL_OWNER);
    expect(f.last().engine.fact).toMatchObject({ state: 'settled', result: 'unknown', acknowledgement: 'accepted', observation: mode === 'changed' ? 'changed' : 'unavailable' });
});
it('source loss after the accepted write leaves historical observation visible without claiming a current source', async () => {
    const f = fixture(); const preview = await clearPreview(f); const execute = f.store.execute.getMockImplementation()!;
    f.store.execute.mockImplementation(async (...args) => { const value = await execute(...args); if (args[1].type === 'clear') f.retireLease(); return value; });
    await f.reviews.confirm(preview.operationId, JOURNAL_OWNER); expect(f.last().engine.fact).toMatchObject({ observation: 'cleared', acknowledgement: 'accepted', sourceCurrentAtObservation: false });
});
it('inspection and replay use the retained primary outcome without another observer, attempt or notification', async () => {
    const f = fixture(); const preview = await clearPreview(f); const outcome = await f.reviews.confirm(preview.operationId, JOURNAL_OWNER); const count = f.snapshots.length;
    expect(f.reviews.inspect(preview.operationId, JOURNAL_OWNER)).toBe(outcome); expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toBe(outcome);
    expect(f.observe).toHaveBeenCalledOnce(); expect(f.snapshots).toHaveLength(count); expect(f.store.execute.mock.calls.filter(([, command]) => command.type === 'clear')).toHaveLength(1);
});
it.each(['cancel', 'expire', 'invalidate'] as const)('a %s unsubmitted clear retires its preview without native mutation', async event => {
    const f = fixture(); const preview = await clearPreview(f);
    if (event === 'cancel') f.reviews.cancel(preview.operationId, JOURNAL_OWNER); else if (event === 'expire') { f.setTime(NOW + 300000); f.reviews.inspect(preview.operationId, JOURNAL_OWNER); } else f.reviews.invalidate();
    expect(f.last().engine.fact).toMatchObject({ state: event === 'cancel' ? 'cancelled' : 'blocked', submitted: false, sourceCurrentAtObservation: null });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'expired' }); expect(f.store.execute.mock.calls.some(([, command]) => command.type === 'clear')).toBe(false);
});
it('source loss during observer capture retires its exact retained plan even when the fence later recovers', async () => {
    const f = fixture(); const observe = f.observe.getMockImplementation()!;
    f.observe.mockImplementation((...args) => { const trace = observe(...args); f.ports.fence.mockReturnValueOnce(null); return trace; });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'stale' });
    const id = f.ports.identifier.mock.results[0].value; expect(await f.reviews.confirm(id, JOURNAL_OWNER)).toEqual({ state: 'expired' });
    expect(f.last().engine.fact.state).toBe('blocked');
});
it.each(['capture', 'confirming', 'submitted', 'acknowledged', 'complete', 'cancelled', 'blocked'] as const)('a failed secondary %s callback cannot reject or repeat the primary operation', async event => {
    const f = fixture(); const fail = () => { throw new Error('secondary'); }; const nothing = () => undefined;
    f.observe.mockImplementation(() => { if (event === 'capture') return fail(); return { confirming: event === 'confirming' ? fail : nothing,
        submitted: event === 'submitted' ? fail : nothing, acknowledged: event === 'acknowledged' ? fail : nothing,
        complete: event === 'complete' ? fail : nothing, cancelled: event === 'cancelled' ? fail : nothing, blocked: event === 'blocked' ? fail : nothing }; });
    const preview = await clearPreview(f);
    if (event === 'cancelled') { expect(f.reviews.cancel(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'cancelled' }); }
    else if (event === 'blocked') { expect(() => f.reviews.invalidate()).not.toThrow(); }
    else { expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toMatchObject({ state: 'observed-cleared' }); expect(f.lease.release).toHaveBeenCalledOnce(); }
});
it('observer mutation of its detached completion input cannot change the retained native outcome', async () => {
    const f = fixture(); const preview = await clearPreview(f); vi.spyOn(f.last().engine, 'complete').mockImplementation(result => {
        expect(Object.isFrozen(result)).toBe(true); Object.defineProperty(result, 'state', { value: 'private' });
    });
    const outcome = await f.reviews.confirm(preview.operationId, JOURNAL_OWNER); expect(outcome.state).toBe('observed-cleared'); expect(f.reviews.inspect(preview.operationId, JOURNAL_OWNER)).toBe(outcome);
});
it('reservation denial settles before submission instead of guessing an unapplied native command', async () => {
    const f = fixture(); const preview = await clearPreview(f); f.ports.reserve.mockReturnValueOnce(null as never);
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'busy' });
    expect(f.last().engine.fact).toMatchObject({ state: 'settled', result: 'busy', submitted: false, acknowledgement: 'not-observed' });
});
it.each(['expired', 'clock-rollback'] as const)('a retained %s native result is retired without resubmitting or rewriting its terminal fact', async reason => {
    const f = fixture(); const preview = await clearPreview(f); await f.reviews.confirm(preview.operationId, JOURNAL_OWNER); const fact = f.last().engine.fact; const count = f.store.execute.mock.calls.length;
    f.setTime(reason === 'expired' ? NOW + 300000 : NOW - 1); expect(f.reviews.inspect(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'expired' });
    expect(await f.reviews.confirm(preview.operationId, JOURNAL_OWNER)).toEqual({ state: 'expired' }); expect(f.store.execute).toHaveBeenCalledTimes(count); expect(f.last().engine.fact).toBe(fact);
});
it('invalidation inside capture retires the already removed preview without restoring it or submitting native clear', async () => {
    const f = fixture(); const observe = f.observe.getMockImplementation()!;
    f.observe.mockImplementation((...args) => { const trace = observe(...args); f.reviews.invalidate(); return trace; });
    expect(await f.reviews.preview('diagnostics', JOURNAL_OWNER)).toEqual({ state: 'stale' });
    const id = f.ports.identifier.mock.results[0].value; expect(f.reviews.inspect(id, JOURNAL_OWNER)).toEqual({ state: 'expired' });
    expect(f.last().engine.fact.state).toBe('blocked'); expect(f.store.execute.mock.calls.some(([, command]) => command.type === 'clear')).toBe(false);
});
