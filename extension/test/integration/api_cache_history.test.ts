import { expect, it, vi } from 'vitest';
import { CurrentOperations } from '../../src/application/current_operations.ts';
import { apiCacheReviewsFixture, CACHE_OWNER } from '../fixtures/api_cache_reviews.ts';
import { journalWriterFixture } from '../fixtures/journal_writer.ts';

it('consented cache observations use the actual writer and cannot skip required native journal transitions', async () => {
    const history = await journalWriterFixture(); await history.ready(); const native = apiCacheReviewsFixture();
    const current = new CurrentOperations({ now: () => 1000, changed: vi.fn(), admit: (fact, source) => history.writer.admit('diagnostics', fact, source),
        update: (ticket, fact) => history.writer.update(ticket, fact), retention: ticket => history.writer.retention(ticket) });
    native.ports.observe.mockImplementation((owner, source) => current.reviewApiCache(owner, source)!);
    const review = native.preview(); await history.writer.flush();
    expect(history.journals.get('diagnostics')).toMatchObject({ entries: [{ fact: { kind: 'cache-operation', action: 'clear-api-cache', state: 'reviewed' } }] });
    expect(native.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' }); await history.writer.flush();
    expect(history.journals.get('diagnostics')).toMatchObject({ entries: [{ fact: { kind: 'cache-operation', action: 'clear-api-cache', state: 'cleared' } }] });
    expect(history.writer.state('diagnostics')).toMatchObject({ dropped: 0, issue: 'none', pending: 0 });
    const updates = history.commands.filter(([, command]) => command.type === 'update').map(([, command]) => command.type === 'update' ? command.fact : null);
    expect(updates).toContainEqual({ kind: 'cache-operation', action: 'clear-api-cache', state: 'submitted' });
    expect(updates).toContainEqual({ kind: 'cache-operation', action: 'clear-api-cache', state: 'cleared' });
    expect(JSON.stringify(history.journals.get('diagnostics'))).not.toMatch(/synthetic_|witness|secret|etag|repository/);
    current.stop(); history.writer.dispose();
});
it('cache clearing cannot enable collection or create generated rows when actual consent is off', async () => {
    const history = await journalWriterFixture(false); await history.ready(); const native = apiCacheReviewsFixture(); const preferences = JSON.stringify(await history.repository.inspect()); const writes = vi.mocked(history.port.set).mock.calls.length;
    const current = new CurrentOperations({ now: () => 1000, changed: vi.fn(), admit: (fact, source) => history.writer.admit('diagnostics', fact, source),
        update: (ticket, fact) => history.writer.update(ticket, fact), retention: ticket => history.writer.retention(ticket) });
    native.ports.observe.mockImplementation((owner, source) => current.reviewApiCache(owner, source)!);
    const review = native.preview(); expect(native.reviews.confirm(review.operationId, CACHE_OWNER)).toEqual({ state: 'cleared' }); await history.writer.flush();
    expect(history.journals.size).toBe(0); expect(history.commands.some(([, command]) => command.type !== 'read')).toBe(false);
    expect(JSON.stringify(await history.repository.inspect())).toBe(preferences); expect(history.port.set).toHaveBeenCalledTimes(writes);
    expect(current.read(CACHE_OWNER)).toMatchObject({ state: 'current', operation: { family: 'cache', stage: 'cleared', retention: 'untracked' } });
    current.stop(); history.writer.dispose();
});
