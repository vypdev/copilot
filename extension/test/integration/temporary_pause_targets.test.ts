import { expect, it, vi } from 'vitest';
import { BrowserPauseTargets } from '../../src/adapters/browser/temporary_pause_targets.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { deferred } from '../fixtures/runtime.ts';

function fixture() { const h = browserFixture(); return { ...h, targets: new BrowserPauseTargets(h.api.tabs) }; }
it('captures a native GitHub source with only bounded semantic display metadata, excluding query/hash/title', async () => {
    const h = fixture(); vi.mocked(h.api.tabs.get).mockResolvedValue({ url: 'https://github.com/octo/example/pull/42?secret=do-not-copy#private', incognito: false });
    expect(await h.targets.target(7)).toEqual({ tabId: 7, source: 'https://github.com/octo/example/pull/42', label: 'octo/example · #42' });
    expect(h.api.permissions.request).not.toHaveBeenCalled(); expect(h.api.tabs.create).not.toHaveBeenCalled();
});
it.each([
    { url: 'https://github.com/octo/example', incognito: true }, { url: 'https://github.com/octo/example' },
    { url: 'https://github.com.evil.test/octo/example', incognito: false }, { url: 'http://github.com/octo/example', incognito: false },
    { url: 'https://secret@github.com/octo/example', incognito: false }, { url: 'https://user:secret@github.com/octo/example', incognito: false },
    { url: 'https://github.com:444/octo/example', incognito: false }, { url: 'https://github.com/\nsecret', incognito: false },
    { url: 'https://github.com/\\other', incognito: false }, { url: 'x'.repeat(4097), incognito: false },
    { url: 'not a url', incognito: false }, { incognito: false },
])('rejects an unknown/private/foreign native target %j', async tab => {
    const h = fixture(); vi.mocked(h.api.tabs.get).mockResolvedValue(tab); expect(await h.targets.target(7)).toBeNull();
});
it('a native failure or invalid ID cannot be guessed or turned into a page navigation', async () => {
    const h = fixture(); expect(await h.targets.target(-1)).toBeNull(); expect(h.api.tabs.get).not.toHaveBeenCalled();
    vi.mocked(h.api.tabs.get).mockRejectedValue(new Error('missing tab')); expect(await h.targets.target(7)).toBeNull(); expect(h.api.tabs.create).not.toHaveBeenCalled();
});
it.each(['https://github.com/', 'https://github.com/settings/tokens', `https://github.com/${'a'.repeat(250)}/repo`])('uses a generic label for protected/unidentified scope without copying private path %s', async url => {
    const h = fixture(); vi.mocked(h.api.tabs.get).mockResolvedValue({ url, incognito: false }); expect(await h.targets.target(7)).toMatchObject({ tabId: 7, label: null });
});
it('lists admissible IDs once in stable order and never exposes private native sources', async () => {
    const h = fixture(); vi.mocked(h.api.tabs.query).mockResolvedValue([{ id: 9 }, { id: 7 }, { id: 9 }, {}, { id: -1 }]);
    const result = await h.targets.list(() => true); expect(result).toEqual({ state: 'ready', tabs: [{ tabId: 7, label: 'octo/example · #42' }, { tabId: 9, label: 'octo/example · #42' }], limited: false });
    expect(h.api.tabs.get).toHaveBeenCalledTimes(2); expect(JSON.stringify(result)).not.toContain('https://'); expect(h.api.tabs.query).toHaveBeenCalledWith({ url: 'https://github.com/*' });
});
it('lists an observed empty set separately from a failed query', async () => {
    const h = fixture(); expect(await h.targets.list(() => true)).toEqual({ state: 'ready', tabs: [], limited: false });
    vi.mocked(h.api.tabs.query).mockRejectedValue(new Error('native unavailable')); expect(await h.targets.list(() => true)).toEqual({ state: 'unavailable' });
});
it('bounds native lookups at128 and discloses a limited target list', async () => {
    const h = fixture(); vi.mocked(h.api.tabs.query).mockResolvedValue(Array.from({ length: 129 }, (_, id) => ({ id })));
    const result = await h.targets.list(() => true); expect(result.state === 'ready' && result.tabs.length).toBe(128); expect(result).toMatchObject({ limited: true }); expect(h.api.tabs.get).toHaveBeenCalledTimes(128);
});
it('has at most four native lookups outstanding, rather than launching an unbounded tab scan', async () => {
    const h = fixture(); vi.mocked(h.api.tabs.query).mockResolvedValue(Array.from({ length: 9 }, (_, id) => ({ id })));
    const pending = deferred<{ url: string; incognito: boolean }>(); vi.mocked(h.api.tabs.get).mockReturnValue(pending.promise);
    const request = h.targets.list(() => true); await vi.waitFor(() => expect(h.api.tabs.get).toHaveBeenCalledTimes(4)); pending.resolve({ url: 'https://github.com/', incognito: false });
    expect(await request).toMatchObject({ state: 'ready' }); expect(h.api.tabs.get).toHaveBeenCalledTimes(9);
});
it('retired authority before/during enumeration prevents publication and any extra native lookup', async () => {
    const h = fixture(); expect(await h.targets.list(() => false)).toEqual({ state: 'stale' }); expect(h.api.tabs.query).not.toHaveBeenCalled();
    expect(await h.targets.list(() => { throw new Error('gone'); })).toEqual({ state: 'stale' });
    const pending = deferred<{ id: number }[]>(); vi.mocked(h.api.tabs.query).mockReturnValueOnce(pending.promise); let live = true;
    const request = h.targets.list(() => live); live = false; pending.resolve([{ id: 7 }]); expect(await request).toEqual({ state: 'stale' }); expect(h.api.tabs.get).not.toHaveBeenCalled();
});
it('a source retired during native lookups yields a stale result, never a partial current list', async () => {
    const h = fixture(); vi.mocked(h.api.tabs.query).mockResolvedValue([{ id: 7 }, { id: 9 }]); let live = true;
    const pending = deferred<{ url: string; incognito: boolean }>(); vi.mocked(h.api.tabs.get).mockReturnValueOnce(pending.promise);
    const request = h.targets.list(() => live); await vi.waitFor(() => expect(h.api.tabs.get).toHaveBeenCalled()); live = false; pending.resolve({ url: 'https://github.com/', incognito: false });
    expect(await request).toEqual({ state: 'stale' });
});
it('a tab that becomes unavailable after the host query is omitted without claiming a positive target', async () => {
    const h = fixture(); vi.mocked(h.api.tabs.query).mockResolvedValue([{ id: 7 }]); vi.mocked(h.api.tabs.get).mockResolvedValue({ url: 'https://elsewhere.test/', incognito: false });
    expect(await h.targets.list(() => true)).toEqual({ state: 'ready', tabs: [], limited: false });
});
