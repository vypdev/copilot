import { afterEach, expect, it, vi } from 'vitest';
import { backgroundCenterFixture } from '../fixtures/background_center.ts';
const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0)) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() { const h = backgroundCenterFixture(); stops.push(h.stop); return h; }
it.each([{ url: 'https://github.com/private/repo?token=hidden#private' }, { status: 'loading' }, { status: 'complete' }, { status: 'complete', url: 'https://github.com/private' }])('actual native updates %j send only the opaque tab identity and a retirement flag', changes => {
    const h = fixture(); for (const listener of h.onUpdated.listeners) listener(7, changes);
    expect(h.api.runtime.sendMessage).toHaveBeenCalledWith({ version: 1, method: 'center.pauses.targets.changed', tabId: 7, retired: !!changes.url || changes.status === 'loading' });
    const messages = vi.mocked(h.api.runtime.sendMessage).mock.calls.map(([input]) => input).filter(input => (input as { method: string }).method === 'center.pauses.targets.changed');
    expect(JSON.stringify(messages)).not.toContain('https:'); expect(JSON.stringify(messages)).not.toContain('hidden');
});
it('unrelated native update fields cannot retire a valid review or disclose the tab title', () => {
    const h = fixture(); for (const listener of h.onUpdated.listeners) listener(7, { status: 'unknown' });
    expect(vi.mocked(h.api.runtime.sendMessage).mock.calls.some(([input]) => (input as { method: string }).method === 'center.pauses.targets.changed')).toBe(false);
});
it('a native tab closure publishes retirement independently of the asynchronous pause cleanup', () => {
    const h = fixture(); for (const listener of h.onRemoved.listeners) listener(7);
    expect(h.api.runtime.sendMessage).toHaveBeenCalledWith({ version: 1, method: 'center.pauses.targets.changed', tabId: 7, retired: true });
});
it('an unavailable options receiver cannot throw back into native tab invalidation', async () => {
    const h = fixture(); vi.mocked(h.api.runtime.sendMessage).mockRejectedValue(new Error('no native page'));
    expect(() => { for (const listener of h.onUpdated.listeners) listener(7, { status: 'complete' }); }).not.toThrow(); await Promise.resolve();
});
