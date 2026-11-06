import { expect, it, vi } from 'vitest';
import { HistoryReviewClient } from '../../src/application/history_review_client.ts';
import { historyWireExamples } from '../fixtures/history_wire.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { HistoryRequest } from '../../src/domain/history_request.ts';

it('bounds stalled retired previews and reserves a result observation even when the effect slots are saturated', async () => {
    const f = await historyWireExamples(); if (f.start.state !== 'preview') throw new Error('missing');
    const gate = deferred<unknown>(); const ports = { request: vi.fn(async (_message: HistoryRequest): Promise<unknown> => gate.promise), now: () => f.start.state === 'preview' ? f.start.expiresAt - 1 : 0, canMutate: () => true, changed: vi.fn() };
    const client = new HistoryReviewClient(ports, vi.fn()); const pending: Promise<void>[] = [];
    for (let i = 0; i < 16; i++) { pending.push(client.preview('collection', 'diagnostics')); client.retire(); }
    await client.preview('collection', 'diagnostics'); expect(client.view.issue).toBe('busy'); expect(ports.request).toHaveBeenCalledTimes(16);
    gate.resolve(f.start); await Promise.all(pending); expect(client.view.review).toBeNull(); client.stop();
});
it('an observational reentry cannot make an effect exceed capacity; no dropped confirmation is retried automatically', async () => {
    const f = await historyWireExamples(); if (f.start.state !== 'preview') throw new Error('missing'); const ghosts = deferred<unknown>(); const read = deferred<unknown>();
    const ports = { request: vi.fn(async (_message: HistoryRequest): Promise<unknown> => ghosts.promise), now: () => f.start.state === 'preview' ? f.start.expiresAt - 1 : 0, canMutate: () => true, changed: vi.fn() };
    const client = new HistoryReviewClient(ports, vi.fn()); const old: Promise<void>[] = [];
    for (let i = 0; i < 15; i++) { old.push(client.preview('collection', 'diagnostics')); client.retire(); }
    ports.request.mockResolvedValueOnce(f.start); await client.preview('collection', 'diagnostics'); let inspection: Promise<void> | null = null;
    ports.request.mockReturnValueOnce(read.promise); ports.changed.mockImplementation(() => { if (client.view.review?.phase === 'committing' && !inspection) inspection = client.inspect(); });
    await client.confirm(); expect(ports.request.mock.calls.filter(([message]) => message.method === 'center.collection.confirm')).toHaveLength(0);
    expect(client.view.review?.phase).toBe('unknown'); expect(client.view.issue).toBe('unavailable');
    read.resolve({ state: 'not-submitted' }); await inspection; expect(client.view.review?.outcome?.state).toBe('not-submitted');
    ghosts.resolve(f.start); await Promise.all(old); client.stop();
});
