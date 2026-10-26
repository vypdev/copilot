import { expect, it } from 'vitest';
import { allowedMessage, extensionSender, pageSender, parseMessage } from '../../src/domain/protocol.ts';
import { pageIdentity, sameEpoch } from '../../src/domain/page.ts';
import { validSession, currentFence } from '../../src/domain/session.ts';
import { CONNECTED, PAGE, context } from '../fixtures/runtime.ts';

const origin = 'chrome-extension://test/';
const extension = { id: 'test', url: `${origin}runtime.html`, origin: origin.slice(0, -1), frameId: 0 };
const sender = { id: 'test', url: PAGE.route, origin: 'https://github.com', frameId: 0, tab: { id: 1, url: PAGE.route, incognito: false } };
it('github-browser-extension-runtime-C01/github-browser-extension-runtime-C02 distinguishes route and native object generations, issues and same-number PRs', () => {
    const issue = pageIdentity(PAGE.route)!; const pull = pageIdentity(PAGE.route.replace('issues', 'pull'))!;
    expect(issue.kind).toBe('issue'); expect(pull.kind).toBe('pull'); expect(issue.object).not.toBe(pull.object);
    expect(pageIdentity(`${PAGE.route}/files`)?.object).toBe(issue.object);
    expect(pageIdentity(PAGE.route, '123')?.object).not.toBe(pageIdentity(PAGE.route, '124')?.object);
    expect(pageIdentity(PAGE.route, 'bad')?.object).toBe(issue.object);
    expect(pageIdentity('https://github.com/octo/example')?.kind).toBe('repository');
    expect(pageIdentity('https://github.com/')?.kind).toBe('other');
    expect(pageIdentity('https://github.com/octo/%65xample')?.repository).toBe('');
    expect(pageIdentity('https://github.com/octo/example/issues/new')?.number).toBe(null);
    expect(pageIdentity('https://github.com/settings/tokens')).toBe(null);
});
it('github-browser-extension-runtime-C06 rejects each independently moved epoch and detects stale route/object fences', () => {
    const epochs = context().epochs; expect(sameEpoch(epochs, { ...epochs })).toBe(true);
    for (const key of ['route', 'object', 'settings', 'credential'] as const) expect(sameEpoch(epochs, { ...epochs, [key]: 9 })).toBe(false);
    const fence = { generation: 2, route: PAGE.route, repositoryId: '7' };
    expect(currentFence(undefined, fence)).toBe(true); expect(currentFence(fence, fence)).toBe(true);
    expect(currentFence(fence, { ...fence, generation: 3 })).toBe(true);
    for (const next of [{ ...fence, generation: -1 }, { ...fence, generation: 1 }, { ...fence, route: 'other' }, { ...fence, repositoryId: '8' }]) expect(currentFence(fence, next)).toBe(false);
});
it('github-browser-extension-runtime-C04 validates closed messages including settings, session and bounded page snapshots', () => {
    for (const value of [{ version: 1, method: 'settings.read' }, { version: 1, method: 'session.status' }, { version: 1, method: 'session.disconnect' },
        { version: 1, method: 'settings.write', settings: {}, expectedRevision: 0 },
        { version: 1, method: 'session.connect', secret: CONNECTED.secret, repository: CONNECTED.repository }, PAGE,
        { ...PAGE, repositoryId: '', viewer: null }]) expect(parseMessage(value)).toEqual(value);
    for (const value of [null, [], {}, { method: 'settings.read', version: 2 }, { method: 3, version: 1 },
        { version: 1, method: 'settings.read', extra: true }, { version: 1, method: 'settings.write', settings: {}, expectedRevision: -1 },
        { version: 1, method: 'settings.write', expectedRevision: 0 }, { version: 1, method: 'fetch', url: 'https://evil.invalid' }]) expect(parseMessage(value)).toBe(null);
});
it('github-browser-extension-runtime-C04 rejects malformed credential, repository, route, viewer, flags and oversized snapshot operands', () => {
    const connect = { version: 1, method: 'session.connect', secret: CONNECTED.secret, repository: CONNECTED.repository };
    for (const patch of [{ extra: true }, { secret: 1 }, { secret: 'x' }, { secret: `${CONNECTED.secret}\n` }, { repository: 1 },
        { repository: 'https://evil.invalid' }, { repository: `${'a'.repeat(200)}/b` }]) expect(parseMessage({ ...connect, ...patch })).toBe(null);
    for (const patch of [{ extra: true }, { route: 1 }, { route: `https://github.com/?q=${'x'.repeat(4100)}` }, { route: 'https://github.com/login' },
        { generation: -1 }, { repositoryId: 1 }, { repositoryId: '0' }, { viewer: 1 }, { viewer: '<html>' }, { visible: 1 }, { manual: 1 }]) expect(parseMessage({ ...PAGE, ...patch })).toBe(null);
});
it('github-browser-extension-runtime-C26 rejects sender, top frame, exact origin, stale tab, incognito and untrusted extension paths', () => {
    expect(pageSender(sender, 'test')).toBe(true); expect(pageSender({ ...sender, origin: undefined }, 'test')).toBe(true);
    for (const patch of [{ id: 'foreign' }, { frameId: 1 }, { tab: undefined }, { tab: { ...sender.tab, id: 0 } },
        { tab: { ...sender.tab, incognito: true } }, { tab: { ...sender.tab, incognito: undefined } }, { url: undefined },
        { tab: { ...sender.tab, url: 'https://github.com/other/repo' } }, { origin: 'https://evil.invalid' },
        { url: 'https://github.com/login', tab: { ...sender.tab, url: 'https://github.com/login' } }]) expect(pageSender({ ...sender, ...patch }, 'test')).toBe(false);
    expect(extensionSender(extension, 'test', origin)).toBe(true);
    expect(extensionSender({ id: 'test', url: extension.url }, 'test', origin)).toBe(true);
    for (const patch of [{ id: 'foreign' }, { url: `${origin}runtime.html?evil` }, { origin: 'https://github.com' }, { frameId: 1 },
        { tab: { incognito: true } }]) expect(extensionSender({ ...extension, ...patch }, 'test', origin)).toBe(false);
});
it('github-browser-extension-runtime-C17 permits only packaged credential commands and never arbitrary page authority', () => {
    const connect = parseMessage({ version: 1, method: 'session.connect', secret: CONNECTED.secret, repository: CONNECTED.repository })!;
    expect(allowedMessage(connect, extension, 'test', origin)).toBe(true);
    expect(allowedMessage(connect, sender, 'test', origin)).toBe(false);
    expect(allowedMessage(PAGE, sender, 'test', origin)).toBe(true);
    expect(allowedMessage({ ...PAGE, route: `${PAGE.route}?other` }, sender, 'test', origin)).toBe(false);
    expect(allowedMessage(PAGE, extension, 'test', origin)).toBe(false);
    expect(allowedMessage({ version: 1, method: 'settings.read' }, sender, 'test', origin)).toBe(true);
});
it('github-browser-extension-runtime-C19 validates a bounded protected session and rejects extra or malformed authority', () => {
    expect(validSession(CONNECTED)).toBe(true);
    for (const value of [null, { ...CONNECTED, extra: 1 }, { ...CONNECTED, schemaVersion: 2 }, { ...CONNECTED, secret: null },
        { ...CONNECTED, secret: 'short' }, { ...CONNECTED, viewerLogin: null }, { ...CONNECTED, viewerLogin: '<html>' },
        { ...CONNECTED, viewerId: 1 }, { ...CONNECTED, viewerId: '0' }, { ...CONNECTED, repositoryId: '7\n' },
        { ...CONNECTED, repository: 1 }, { ...CONNECTED, repository: 'invalid' }]) expect(validSession(value)).toBe(false);
});

it('hidden-page release is closed, generation bound and allowed only from the exact top-level content context', () => {
    const message = { version: 1, method: 'page.release', generation: 1 } as const;
    expect(parseMessage(message)).toEqual(message); expect(allowedMessage(message, sender, 'test', origin)).toBe(true);
    expect(allowedMessage(message, extension, 'test', origin)).toBe(false);
    expect(parseMessage({ ...message, generation: -1 })).toBe(null); expect(parseMessage({ ...message, extra: true })).toBe(null);
});
