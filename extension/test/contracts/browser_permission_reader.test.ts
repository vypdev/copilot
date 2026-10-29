import { expect, it, vi } from 'vitest';
import { BrowserPermissionReader } from '../../src/adapters/browser/permission_reader.ts';
import { BROWSER_CAPABILITIES, permissionQuery } from '../../src/domain/permission_inspection.ts';
import { browserFixture, event } from '../fixtures/browser.ts';
import type { BrowserApi } from '../../src/adapters/browser/api.ts';

it.each(BROWSER_CAPABILITIES)('uses one exact native %s query and preserves its receiver without requesting access', async capability => {
    const h = browserFixture(); const reader = new BrowserPermissionReader(h.api);
    vi.mocked(h.api.permissions.contains).mockImplementation(async function (this: BrowserApi['permissions']) { expect(this).toBe(h.api.permissions); return true; });
    expect(await reader.query(capability)).toBe('granted'); expect(h.api.permissions.contains).toHaveBeenCalledWith(permissionQuery(capability));
    vi.mocked(h.api.permissions.contains).mockResolvedValueOnce(false); expect(await reader.query(capability)).toBe('not-granted');
    expect(h.api.permissions.request).not.toHaveBeenCalled(); expect(h.api.runtime.sendMessage).not.toHaveBeenCalled();
});
it.each([undefined, null, 1, 'yes', {}])('maps malformed native reply %j to unknown rather than a truthy grant or denial', async value => {
    const h = browserFixture(); vi.mocked(h.api.permissions.contains).mockResolvedValueOnce(value as boolean);
    expect(await new BrowserPermissionReader(h.api).query('github-api')).toBe('unknown');
});
it('maps a rejected native call or unavailable native property to safe unknown without provider text', async () => {
    const h = browserFixture(); vi.mocked(h.api.permissions.contains).mockRejectedValueOnce(new Error('private-native-failure'));
    expect(await new BrowserPermissionReader(h.api).query('github-api')).toBe('unknown');
    Object.defineProperty(h.api, 'permissions', { get: () => { throw new Error('private-property'); } });
    expect(await new BrowserPermissionReader(h.api).query('github-api')).toBe('unknown');
});
it('feature-detects absent permission methods as unsupported', async () => {
    const h = browserFixture(); Object.defineProperty(h.api.permissions, 'contains', { value: undefined });
    expect(await new BrowserPermissionReader(h.api).query('github-api')).toBe('unsupported');
    Object.defineProperty(h.api, 'permissions', { value: undefined });
    expect(await new BrowserPermissionReader(h.api).query('github-api')).toBe('unsupported');
});
it('copies fixed operands so a native consumer cannot mutate the policy for a later query', async () => {
    const h = browserFixture(); const reader = new BrowserPermissionReader(h.api);
    vi.mocked(h.api.permissions.contains).mockImplementation(async query => { query.origins?.push('https://not-allowed.invalid/*'); return true; });
    await reader.query('github-api'); await reader.query('github-api');
    expect(permissionQuery('github-api')).toEqual({ origins: ['https://api.github.com/*'] });
    expect(vi.mocked(h.api.permissions.contains).mock.calls[1][0].origins).toHaveLength(2);
});
it('registers only supported native permission events and removes exactly those subscriptions', () => {
    const h = browserFixture(); const added = event<(value: { origins?: string[] }) => void>(); h.api.permissions.onAdded = added;
    const changed = vi.fn(); const dispose = new BrowserPermissionReader(h.api).observe(changed);
    for (const listener of added.listeners) listener({ origins: ['https://api.github.com/*'] });
    for (const listener of h.permissionRemoved.listeners) listener({});
    expect(changed).toHaveBeenCalledTimes(2); dispose(); expect(added.listeners.size).toBe(0); expect(h.permissionRemoved.listeners.size).toBe(0);
});
it('retains manual querying when native event registration is absent or fails, without leaking successful earlier listeners', () => {
    const h = browserFixture(); const added = event<(value: { origins?: string[] }) => void>(); h.api.permissions.onAdded = added;
    vi.mocked(h.api.permissions.onRemoved.addListener).mockImplementation(() => { throw new Error('closed'); });
    const dispose = new BrowserPermissionReader(h.api).observe(vi.fn()); expect(added.listeners.size).toBe(1); dispose(); expect(added.listeners.size).toBe(0);
    Object.defineProperty(h.api, 'permissions', { value: undefined }); new BrowserPermissionReader(h.api).observe(vi.fn())();
});
it('ignores a late native removal failure after closing the subscription owner', () => {
    const h = browserFixture(); const dispose = new BrowserPermissionReader(h.api).observe(vi.fn());
    vi.mocked(h.api.permissions.onRemoved.removeListener).mockImplementation(() => { throw new Error('native-closed'); });
    expect(dispose).not.toThrow();
});
