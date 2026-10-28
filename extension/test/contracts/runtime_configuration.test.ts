import { expect, it } from 'vitest';
import { allowedMessage, parseMessage } from '../../src/domain/protocol.ts';
import { decodeRuntimeConfiguration, pageProfileContext, runtimeConfiguration } from '../../src/domain/runtime_configuration.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { CONFIG, configurationReply, pageSender, scopedSettings } from '../fixtures/page_configuration.ts';
import { CONNECTED } from '../fixtures/runtime.ts';

it('configuration is content-only, closed, native-route bound and cannot disguise a manual or arbitrary provider request', () => {
    expect(parseMessage(CONFIG)).toEqual(CONFIG); expect(allowedMessage(CONFIG, pageSender, 'test', 'chrome-extension://test/')).toBe(true);
    for (const patch of [{ manual: true }, { extra: 1 }, { route: 'https://github.com/login' }, { repositoryId: '0' }]) expect(parseMessage({ ...CONFIG, ...patch })).toBe(null);
    expect(allowedMessage(CONFIG, { id: 'test', url: 'chrome-extension://test/runtime.html' }, 'test', 'chrome-extension://test/')).toBe(false);
    expect(allowedMessage(CONFIG, { ...pageSender, tab: { ...pageSender.tab, url: `${CONFIG.route}?changed` } }, 'test', 'chrome-extension://test/')).toBe(false);
});
it('account context needs verified identity and repository/organization matching additionally needs canonical route and numeric repository', () => {
    const organization = { ...CONNECTED, organizationId: '3' };
    expect(pageProfileContext(CONFIG, null)).toMatchObject({ accountId: null, repositoryId: null, organizationId: null });
    expect(pageProfileContext(CONFIG, organization)).toMatchObject({ accountId: '1', repositoryId: '7', organizationId: '3' });
    for (const patch of [{ viewer: null }, { viewer: 'other' }]) expect(pageProfileContext({ ...CONFIG, ...patch }, organization).accountId).toBe(null);
    for (const patch of [{ repositoryId: '8' }, { route: 'https://github.com/other/repo' }]) expect(pageProfileContext({ ...CONFIG, ...patch }, organization))
        .toMatchObject({ accountId: '1', repositoryId: null, organizationId: null });
    expect(pageProfileContext({ ...CONFIG, viewer: 'OCTO' }, CONNECTED).accountId).toBe('1');
});
it('standalone global and host profiles apply without connection while repository settings require verified scope', () => {
    const settings = { ...DEFAULT_SETTINGS, repositories: { '7': { density: 'compact' as const } }, center: { ...DEFAULT_SETTINGS.center,
        profiles: [{ id: 'host', name: 'Host', scope: { kind: 'host' as const, host: 'github.com' as const }, preferences: { shortcuts: true } }], selected: ['host'] } };
    expect(runtimeConfiguration(settings, CONFIG, null, 0)).toMatchObject({ connected: false, settings: { shortcuts: true, density: 'comfortable' } });
    expect(runtimeConfiguration(settings, CONFIG, CONNECTED, 0)).toMatchObject({ connected: false, settings: { density: 'compact' } });
    expect(runtimeConfiguration(scopedSettings(true), CONFIG, CONNECTED, 0)).toMatchObject({ connected: false, settings: { paused: true } });
});
it('a valid receipt is immutable and contains no profile/session collections', () => {
    const reply = configurationReply(CONFIG); const decoded = decodeRuntimeConfiguration(reply, CONFIG, 'unbundled')!;
    expect(decoded).not.toBe(reply); expect(Object.isFrozen(decoded.settings.features)).toBe(true);
    expect(Object.keys(decoded.settings)).toHaveLength(7); expect(decoded.settings).not.toHaveProperty('center');
});
it.each([null, [], {}, { sourceTree: 'foreign' }, { state: 'future' }, { route: `${CONFIG.route}?other` }, { generation: 2 },
    { repositoryId: '8' }, { viewer: 'other' }, { epoch: -1 }, { connected: 1 }, { extra: 'private' }, { settings: null }])('rejects missing, foreign or malformed configuration receipt %j', patch => {
    const value = patch === null || Array.isArray(patch) ? patch : { ...configurationReply(CONFIG), ...patch };
    // The empty patch itself is tested as an absent receipt rather than a valid merged object.
    expect(decodeRuntimeConfiguration(patch && Object.keys(patch).length === 0 ? patch : value, CONFIG, 'unbundled')).toBe(null);
});
it.each([{ revision: -1 }, { locale: 'de' }, { theme: 'system' }, { density: 'dense' }, { shortcuts: 1 }, { paused: 1 },
    { extra: 1 }, { features: null }, { features: {} }, { features: { arbitrary: true } }])('rejects invalid rendering preferences %j', patch => {
    const reply = configurationReply(CONFIG);
    expect(decodeRuntimeConfiguration({ ...reply, settings: { ...reply.settings, ...patch } }, CONFIG, 'unbundled')).toBe(null);
});
it('rejects unknown feature replacements, nonboolean known features, oversized receipts and impossible paused connection grants', () => {
    const reply = configurationReply(CONFIG); const features = { ...reply.settings.features }; delete features['BEX-NAV-01']; features.unknown = true;
    for (const patch of [{ features }, { features: { ...reply.settings.features, 'BEX-NAV-01': 'yes' } }, { paused: true }]) {
        expect(decodeRuntimeConfiguration({ ...reply, connected: true, settings: { ...reply.settings, ...patch } }, CONFIG, 'unbundled')).toBe(null);
    }
    const huge = 'x'.repeat(33000); const request = { ...CONFIG, route: huge };
    expect(decodeRuntimeConfiguration({ ...reply, route: huge }, request, 'unbundled')).toBe(null);
});
