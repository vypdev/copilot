import { expect, it, vi } from 'vitest';
import { PAGE, CONNECTED, deferred } from '../fixtures/runtime.ts';
import { CONFIG, pageSender, pageConfigurationFixture, scopedSettings } from '../fixtures/page_configuration.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';

it('a selected repository profile pause blocks the actual object read, not just its center preview', async () => {
    const h = pageConfigurationFixture(scopedSettings(true)); await h.connected();
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a cold worker observes the retained profile pause before any restoration HTTP', async () => {
    const h = pageConfigurationFixture(scopedSettings(true)); h.cold();
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('verified profile preferences reach content as a minimal configuration without private collections', async () => {
    const h = pageConfigurationFixture(scopedSettings()); await h.connected(); const response = await h.call();
    expect(response).toMatchObject({ state: 'ready', route: PAGE.route, generation: 1, repositoryId: '7', settings: { density: 'compact', shortcuts: true, features: { 'BEX-NAV-01': false } } });
    for (const privateValue of ['Private profile name', 'repo-profile', 'synthetic_not_a_real_credential', 'selected', 'repositories']) expect(JSON.stringify(response)).not.toContain(privateValue);
});

it('a valid cold selection restores once and applies the freshly verified profile before returning content configuration', async () => {
    const h = pageConfigurationFixture(scopedSettings()); h.cold();
    expect(await h.call()).toMatchObject({ state: 'ready', connected: true, settings: { density: 'compact', shortcuts: true } });
    expect(h.reader.read).toHaveBeenCalledTimes(2); expect(await h.call(PAGE)).toMatchObject({ state: 'current' });
    expect(h.reader.read).toHaveBeenCalledTimes(3);
});
it.each(['global', 'host', 'account', 'organization', 'repository'] as const)('a %s profile pause blocks cold restoration and cannot be cleared by a narrower false preference', async kind => {
    const settings = scopedSettings(); const scope = kind === 'global' ? { kind } : kind === 'host' ? { kind, host: 'github.com' as const }
        : kind === 'account' ? { kind, host: 'github.com' as const, accountId: '1' }
            : kind === 'organization' ? { kind, host: 'github.com' as const, accountId: '1', organizationId: '3' }
                : { kind, host: 'github.com' as const, accountId: '1', repositoryId: '7' };
    const h = pageConfigurationFixture({ ...settings, center: { ...settings.center,
        profiles: [{ id: 'pause', name: 'Pause', scope, preferences: { paused: true } }, ...settings.center.profiles], selected: ['pause'] } });
    h.values.set(SESSION_KEY, { ...CONNECTED, organizationId: '3' });
    expect(await h.call()).toMatchObject({ state: 'ready', connected: false, settings: { paused: true } });
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it.each(['global', 'repository'] as const)('a %s preference pause does not even inspect the protected credential', async scope => {
    const settings = scopedSettings(); const h = pageConfigurationFixture(scope === 'global' ? { ...settings, paused: true }
        : { ...settings, repositories: { '7': { connected: true, paused: true } } });
    h.cold(); expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.port.get).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled();
});
it.each(['hidden', 'inactive', 'offline', 'other-repository', 'other-viewer', 'missing-viewer', 'not-connected'] as const)('cold %s context never starts restoration HTTP', async state => {
    const settings = scopedSettings(); const h = pageConfigurationFixture(state === 'not-connected' ? { ...settings, repositories: {} } : settings); h.cold();
    if (state === 'inactive') h.ports.currentTab.mockResolvedValue({ url: PAGE.route, active: false, incognito: false });
    if (state === 'offline') h.ports.online.mockReturnValue(false);
    const request = { ...CONFIG, ...(state === 'hidden' ? { visible: false } : {}), ...(state === 'other-repository' ? { repositoryId: '8' } : {}),
        ...(state === 'other-viewer' ? { viewer: 'other' } : state === 'missing-viewer' ? { viewer: null } : {}) };
    await h.call(request); expect(h.reader.read).not.toHaveBeenCalled();
});
it('configuration and snapshot never expose a different selected repository profile or credential', async () => {
    const h = pageConfigurationFixture(scopedSettings()); await h.connected();
    const request = { ...CONFIG, route: 'https://github.com/octo/other/issues/42', repositoryId: '8' };
    h.ports.currentTab.mockResolvedValue({ url: request.route, active: true, incognito: false });
    expect(await h.call(request, { ...pageSender, tab: { ...pageSender.tab, url: request.route } })).toMatchObject({ state: 'ready', connected: false, settings: { density: 'comfortable', shortcuts: false } });
    expect(h.reader.read).not.toHaveBeenCalled();
});
it('a newly verified organization pause blocks the object GET after restoration without using stale owner metadata', async () => {
    const settings = scopedSettings(); const h = pageConfigurationFixture({ ...settings, center: { ...settings.center,
        profiles: [{ id: 'organization', name: 'Current owner pause', scope: { kind: 'organization', host: 'github.com', accountId: '1', organizationId: '3' }, preferences: { paused: true } }], selected: ['organization'] } });
    h.cold(); vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', etag: '', bytes: 10,
        data: request.type === 'viewer' ? { id: '1', login: 'octo' } : { id: '7', name: 'octo/example', organizationId: '3' } }));
    expect(await h.call(PAGE)).toMatchObject({ state: 'paused' }); expect(h.reader.read).toHaveBeenCalledTimes(2);
});
it('a hidden/replaced page aborts restoration, retains its credential and can restore again only from a fresh scope', async () => {
    const h = pageConfigurationFixture(scopedSettings()); h.cold(); const pending = deferred<ReadResult>();
    vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise); const old = h.call();
    await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1)); const cancellation = vi.mocked(h.reader.read).mock.calls[0][2];
    await h.call({ version: 1, method: 'page.release', generation: 1 }); expect(cancellation.aborted).toBe(true);
    pending.resolve({ state: 'ok', etag: '', bytes: 1, data: { id: '1', login: 'octo' } });
    expect(await old).toMatchObject({ state: 'stale' }); expect(h.values.has(SESSION_KEY)).toBe(true); expect(h.reader.read).toHaveBeenCalledTimes(1);
    expect(await h.call({ ...CONFIG, generation: 2 })).toMatchObject({ state: 'ready', connected: false });
    expect(h.reader.read).toHaveBeenCalledTimes(1); h.advance(10001);
    expect(await h.call({ ...CONFIG, generation: 3 })).toMatchObject({ state: 'ready', connected: true, settings: { density: 'compact' } });
});
it('permission removal and malformed/future settings fail closed without a provider request or raw private diagnostics', async () => {
    const h = pageConfigurationFixture(scopedSettings()); h.cold(); h.sessionPorts.permitted.mockResolvedValue(false);
    expect(await h.call()).toMatchObject({ state: 'ready', connected: false, settings: { density: 'comfortable' } });
    expect(h.values.has(SESSION_KEY)).toBe(false); expect(h.reader.read).not.toHaveBeenCalled();
    for (const value of [{ schemaVersion: 99 }, { bad: 'private' }]) {
        h.local.values.set(SETTINGS_KEY, value); expect(await h.call()).toEqual({ state: 'unavailable' });
    }
});
it('legacy page settings/status cannot read private profiles or bypass a cold pause with restoration', async () => {
    const h = pageConfigurationFixture(scopedSettings(true)); h.cold();
    expect(await h.call({ version: 1, method: 'settings.read' })).toEqual({ state: 'rejected' });
    expect(await h.call({ version: 1, method: 'session.status' })).toMatchObject({ state: 'disconnected' });
    expect(h.port.get).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled();
});

it('a settings revision change during restoration discards the configuration and prevents the object GET', async () => {
    const h = pageConfigurationFixture(scopedSettings()); h.cold(); const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const read = h.call(PAGE); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1));
    h.local.values.set(SETTINGS_KEY, { ...scopedSettings(true), revision: 1 });
    pending.resolve({ state: 'ok', etag: '', bytes: 1, data: { id: '1', login: 'octo' } });
    expect(await read).toMatchObject({ state: 'paused' }); expect(h.reader.read).toHaveBeenCalledTimes(2);
});
it('an account/credential transition during final settings observation cannot publish the old scoped settings', async () => {
    const h = pageConfigurationFixture(scopedSettings()); await h.connected(); const pending = deferred<unknown>();
    const original = vi.mocked(h.local.port.get).getMockImplementation()!; let reads = 0;
    vi.mocked(h.local.port.get).mockImplementation(key => ++reads === 2 ? pending.promise : original(key));
    const read = h.call(); await vi.waitFor(() => expect(reads).toBe(2)); await h.service.revoke(); pending.resolve(scopedSettings());
    expect(await read).toEqual({ state: 'unavailable' });
});
it('a provider identity mismatch never applies an old numeric profile or overwrites the retained session with a different account', async () => {
    const h = pageConfigurationFixture(scopedSettings()); h.cold(); vi.mocked(h.reader.read).mockImplementation(async request => ({ state: 'ok', etag: '', bytes: 1,
        data: request.type === 'viewer' ? { id: '2', login: 'other' } : { id: '7', name: 'octo/example' } }));
    expect(await h.call()).toMatchObject({ connected: false, settings: { density: 'comfortable', shortcuts: false } });
    expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('revocation while protected identity is being inspected stops restoration and cannot revive the previous credential', async () => {
    const h = pageConfigurationFixture(scopedSettings()); h.cold(); const pending = deferred<unknown>();
    vi.mocked(h.port.get).mockReturnValueOnce(pending.promise); const read = h.call(); await vi.waitFor(() => expect(h.port.get).toHaveBeenCalled());
    h.gateway.invalidate(); await h.service.revoke(); pending.resolve(CONNECTED);
    expect(await read).toMatchObject({ state: 'stale' }); expect(h.reader.read).not.toHaveBeenCalled(); expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('going offline during restoration stops before the second identity GET and keeps the durable credential', async () => {
    const h = pageConfigurationFixture(scopedSettings()); h.cold(); const pending = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(pending.promise);
    const read = h.call(); await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalledTimes(1)); h.ports.online.mockReturnValue(false);
    pending.resolve({ state: 'ok', etag: '', bytes: 1, data: { id: '1', login: 'octo' } });
    expect(await read).toMatchObject({ state: 'stale' }); expect(h.reader.read).toHaveBeenCalledTimes(1); expect(h.values.has(SESSION_KEY)).toBe(true);
});
it('unavailable protected storage and malformed retained identities leave standalone settings usable without enabling HTTP', async () => {
    for (const state of ['unprotected', 'malformed', 'missing'] as const) {
        const h = pageConfigurationFixture(scopedSettings());
        if (state === 'unprotected') h.sessionPorts.protected.mockResolvedValue(false);
        if (state === 'malformed') h.values.set(SESSION_KEY, { ...CONNECTED, extra: 'private' });
        expect(await h.call()).toMatchObject({ state: 'ready', connected: false, settings: { density: 'comfortable' } });
        expect(h.reader.read).not.toHaveBeenCalled();
    }
});
