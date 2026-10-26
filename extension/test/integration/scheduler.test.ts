import { expect, it, vi } from 'vitest';
import { ReadScheduler } from '../../src/application/read_scheduler.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { memoryStore, deferred } from '../fixtures/runtime.ts';
import type { ReadResult, GitHubReadPort } from '../../src/application/read_ports.ts';
import { initialSchedule } from '../../src/domain/scheduling.ts';

const activity = { visible: true, active: true, online: true, manual: true, pending: true };
const success = { state: 'ok', data: { id: '1', login: 'octo' }, etag: 'known', bytes: 10 } as const;
function harness() {
    const store = memoryStore(); let now = 100000;
    const reader: GitHubReadPort = { read: vi.fn(async () => success) };
    const scheduler = new ReadScheduler(store.port, reader, () => now, () => 0);
    const run = (key = 'target', override = activity, cancel = new BrowserCancellation()) => scheduler.run(key, 'repo', { type: 'viewer' }, 'synthetic', cancel, override);
    return { ...store, reader, scheduler, run, advance: (ms: number) => { now += ms; } };
}
it('github-browser-extension-runtime-C23 coalesces tabs, enforces two in-flight operations, counts reads before send and drops late invalidated results', async () => {
    const h = harness(); const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValue(pending.promise);
    const first = h.run(); const duplicate = h.run(); const second = h.run('second');
    expect(await h.run('third')).toMatchObject({ state: 'busy' }); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(2));
    h.scheduler.invalidate(); pending.resolve(success);
    for (const result of await Promise.all([first, duplicate, second])) expect(result).toMatchObject({ state: 'aborted' });
    expect(h.values.get('copilot.schedule.v1')).toMatchObject({ count: 2, repositories: { repo: 2 } });
});
it('github-browser-extension-runtime-C23 uses TTL/ETag cache without leaking invalidated generations and persists cooldown across restart', async () => {
    const h = harness(); expect(await h.run()).toEqual(success); expect(await h.run()).toMatchObject({ state: 'cooldown' });
    h.advance(10001); expect(await h.run('target', { ...activity, manual: false })).toEqual(success); expect(h.reader.read).toHaveBeenCalledTimes(1);
    h.advance(60001); vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'unchanged', bytes: 0 });
    expect(await h.run()).toEqual(success); expect(vi.mocked(h.reader.read).mock.calls[1][3]).toBe('known');
    h.scheduler.invalidate(); h.advance(10001); vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'unchanged', bytes: 0 });
    expect(await h.run()).toMatchObject({ state: 'invalid' });
    const restarted = new ReadScheduler(h.port, h.reader, () => 180002, () => 0);
    expect(await restarted.run('target', 'repo', { type: 'viewer' }, 'synthetic', new BrowserCancellation(), activity)).toMatchObject({ state: 'cooldown' });
});
it('github-browser-extension-runtime-C23 malformed storage, quota failure, backwards clock and inactive activity all block provider work', async () => {
    for (const failure of ['malformed', 'quota', 'backward', 'inactive']) {
        const h = harness();
        if (failure === 'malformed') h.values.set('copilot.schedule.v1', { unknown: true });
        if (failure === 'quota') vi.mocked(h.port.set).mockRejectedValue(new Error('private quota'));
        if (failure === 'backward') h.values.set('copilot.schedule.v1', initialSchedule(200000));
        const result = await h.run('target', failure === 'inactive' ? { ...activity, visible: false } : activity);
        expect(result.state).toBe(failure === 'backward' ? 'cooldown' : failure === 'inactive' ? 'inactive' : 'storage-unavailable');
        expect(h.reader.read).not.toHaveBeenCalled();
    }
});
it('github-browser-extension-runtime-C23 persists rate-limit/backoff guidance and does not auto-retry or require keepalive', async () => {
    const h = harness(); vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'limited', retryAfter: 120, bytes: 0 });
    expect(await h.run()).toMatchObject({ state: 'limited' }); expect(await h.run('other')).toMatchObject({ state: 'cooldown' });
    h.advance(120001); expect(await h.run()).toEqual(success);
    const failed = harness(); vi.mocked(failed.reader.read).mockImplementation(async () => {
        vi.mocked(failed.port.set).mockRejectedValue(new Error('quota')); return { state: 'limited', retryAfter: 60, bytes: 0 };
    });
    expect(await failed.run()).toMatchObject({ state: 'storage-unavailable' }); expect(await failed.run('other')).toMatchObject({ state: 'cooldown' });
});
it('github-browser-extension-runtime-C23 enforces response-cache memory/cardinality and hourly budget resets', async () => {
    const h = harness(); vi.mocked(h.reader.read).mockResolvedValue({ ...success, bytes: 600000 });
    await h.run('first'); await h.run('second'); h.advance(10001);
    await h.run('first', { ...activity, manual: false }); expect(h.reader.read).toHaveBeenCalledTimes(3);
    const full = initialSchedule(100000); h.values.set('copilot.schedule.v1', { ...full, count: 600 });
    const restarted = new ReadScheduler(h.port, h.reader, () => 100000, () => 0);
    expect(await restarted.run('x', 'repo', { type: 'viewer' }, 'synthetic', new BrowserCancellation(), activity)).toMatchObject({ state: 'budget' });
    h.advance(3600001); expect((await h.run('after-hour')).state).toBe('ok');
    const many = harness();
    for (let i = 0; i < 129; i++) { if (i === 128) many.advance(3600001); await many.run(String(i)); }
    expect(many.reader.read).toHaveBeenCalledTimes(121);
});
it('cancelled reservations and denied reads cannot populate or retain successful cache entries', async () => {
    const h = harness(); const cancelled = new BrowserCancellation(); cancelled.abort();
    expect(await h.run('cancelled', activity, cancelled)).toMatchObject({ state: 'aborted' }); expect(h.reader.read).not.toHaveBeenCalled();
    await h.run(); h.advance(10001); vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'denied', bytes: 0 }); await h.run();
    h.advance(10001); await h.run('target', { ...activity, manual: false }); expect(h.reader.read).toHaveBeenCalledTimes(3);
});
