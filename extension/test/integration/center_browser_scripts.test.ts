import { expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { runInContext } from 'node:vm';
import { CENTER_BROWSER_SCRIPTS as S, CENTER_SETTINGS_PROBE_KEY } from '../../tooling/center_browser_scripts.mts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';

function fixture(html = '<main aria-busy="false"><h1>Overview</h1></main><nav><a href="#/overview" aria-current="page">Overview</a></nav>') {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://fixture.invalid/' });
    const context = dom.getInternalVMContext();
    const run = (script: string, args: unknown[] = []) => {
        context.__args = args; return runInContext(`(function(){${script}}).apply(null,__args)`, context);
    };
    const asyncRun = (script: string, args: unknown[] = []): Promise<unknown> => new Promise(resolve => run(script, [...args, resolve]));
    return { dom, context, run, asyncRun };
}
it('read-only DOM inspections distinguish destination content, active link, failures and loading from a previous ready page', () => {
    const f = fixture(); const d = f.dom.window.document;
    try {
        expect(f.run(S.ready)).toBe(true); expect(f.run(S.routeReady, ['Loading…', 'Overview', '#/overview'])).toBe(true);
        expect(f.run(S.routeReady, ['Loading…', 'Appearance', '#/appearance'])).toBe(false);
        const loading = d.createElement('p'); loading.setAttribute('role', 'status'); loading.textContent = 'Loading…'; d.querySelector('main')!.append(loading);
        expect(f.run(S.routeReady, ['Loading…', 'Overview', '#/overview'])).toBe(false); loading.setAttribute('role', 'alert'); loading.textContent = 'Unavailable';
        expect(f.run(S.routeReady, ['Loading…', 'Overview', '#/overview'])).toBe(false); loading.remove();
        d.querySelector('a')!.setAttribute('href', '#/other'); expect(f.run(S.routeReady, ['Loading…', 'Overview', '#/overview'])).toBe(false);
        expect(f.run(S.route)).toMatchObject({ heading: 'Overview', active: '#/other' });
        d.querySelector('main')!.setAttribute('aria-busy', 'true'); expect(f.run(S.ready)).toBe(false);
    } finally { f.dom.window.close(); }
});
it('serialized snapshot key matches the real repository contract and reads complete envelopes without any mutation', async () => {
    const f = fixture(); const get = vi.fn(); const set = vi.fn(); f.context.chrome = { storage: { local: { get, set } } };
    try {
        expect(CENTER_SETTINGS_PROBE_KEY).toBe(SETTINGS_KEY);
        const current = { ...DEFAULT_SETTINGS, revision: 2, theme: 'dark' }; const envelope = { current, previous: DEFAULT_SETTINGS, operation: { id: 'op', beforeRevision: 1 } };
        for (const [raw, theme, revision] of [[undefined, 'github', 0], [DEFAULT_SETTINGS, 'github', 0], [envelope, 'dark', 2]] as const) {
            get.mockResolvedValue({ [SETTINGS_KEY]: raw });
            expect(await f.asyncRun(S.snapshot, [SETTINGS_KEY, DEFAULT_SETTINGS])).toEqual({ envelope: JSON.stringify(raw ?? null), theme, revision });
        }
        expect(get).toHaveBeenLastCalledWith(SETTINGS_KEY); expect(set).not.toHaveBeenCalled();
        get.mockRejectedValue(new Error('private provider failure')); expect(await f.asyncRun(S.snapshot, [SETTINGS_KEY, DEFAULT_SETTINGS])).toBeNull();
        get.mockResolvedValue(null); expect(await f.asyncRun(S.snapshot, [SETTINGS_KEY, DEFAULT_SETTINGS])).toBeNull();
    } finally { f.dom.window.close(); }
});
it('native background read uses one fixed query and returns only closed source/state facts even on provider failure', async () => {
    const f = fixture(); const sendMessage = vi.fn().mockResolvedValue({ sourceTree: 'source', state: 'ready', private: 'never-exposed' });
    f.context.browser = { runtime: { sendMessage } };
    try {
        expect(await f.asyncRun(S.background)).toEqual({ source: 'source', state: 'ready' });
        expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ version: 1, method: 'settings.read' });
        sendMessage.mockRejectedValue(new Error('private')); expect(await f.asyncRun(S.background)).toBeNull();
        sendMessage.mockResolvedValue(null); expect(await f.asyncRun(S.background)).toEqual({ source: undefined, state: undefined });
    } finally { f.dom.window.close(); }
});
it('isolated provider probe removes only its own nonsecret marker from both actual-port fixture areas', async () => {
    const f = fixture();
    const area = () => {
        const data: Record<string, unknown> = { retained: 'unchanged' };
        return { data, get: vi.fn(async (key: string) => Object.hasOwn(data, key) ? { [key]: data[key] } : {}),
            set: vi.fn(async (value: object) => { Object.assign(data, value); }), remove: vi.fn(async (key: string) => { delete data[key]; }) };
    };
    const local = area(); const session = area(); f.context.browser = { storage: { local, session } };
    try {
        expect(await f.asyncRun(S.providers, ['owned-probe', 'nonsecret'])).toEqual({ local: true, session: true, clean: true });
        expect(local.data).toEqual({ retained: 'unchanged' }); expect(session.data).toEqual({ retained: 'unchanged' });
        local.data['owned-probe'] = 'foreign'; local.set.mockClear(); local.remove.mockClear();
        expect(await f.asyncRun(S.providers, ['owned-probe', 'nonsecret'])).toEqual({ local: false, session: true, clean: true });
        expect(local.data['owned-probe']).toBe('foreign'); expect(local.set).not.toHaveBeenCalled(); expect(local.remove).not.toHaveBeenCalled();
        session.set.mockRejectedValue(new Error('quota')); expect(await f.asyncRun(S.providers, ['new-probe', 'nonsecret'])).toEqual({ local: true, session: false, clean: true });
        local.remove.mockRejectedValue(new Error('remove-failed')); expect(await f.asyncRun(S.providers, ['last-probe', 'nonsecret'])).toEqual({ local: true, session: false, clean: false });
    } finally { f.dom.window.close(); }
});
