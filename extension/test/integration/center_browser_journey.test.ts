import { expect, it, vi } from 'vitest';
import { runCenterBrowserJourney as run } from '../../tooling/center_browser_journey.mts';
import { CENTER_BROWSER_SCRIPTS as S } from '../../tooling/center_browser_scripts.mts';
import { CENTER_ROUTES } from '../../src/domain/center_routes.ts';
import { CENTER_SOURCE as source, centerBrowserDriver } from '../fixtures/center_browser_driver.ts';

it('both native target assertion paths require every route, cancellation, one save, reopening and clean providers without claiming full H3', async () => {
    for (const target of ['chrome', 'firefox'] as const) {
        const f = centerBrowserDriver(target); const receipt = await run(f.driver, target, f.options, source, vi.fn());
        expect(receipt).toMatchObject({ routes: CENTER_ROUTES, fullH3Acceptance: false, sourceTreeSha256: source.sourceTreeSha256 });
        expect(f.snapshot()).toMatchObject({ theme: 'github', revision: 2 });
        expect(f.driver.navigate).toHaveBeenNthCalledWith(1, 'about:blank');
        expect(f.driver.navigate).toHaveBeenNthCalledWith(2, f.options);
        expect(f.click.mock.calls.filter(([selector]) => selector.endsWith('.actions > button:first-child'))).toHaveLength(2);
    }
});
it('waits for the destination heading and active navigation instead of accepting the previous route readiness', async () => {
    const f = centerBrowserDriver(); const inspect = f.evaluate.getMockImplementation()!; const pause = vi.fn(); let delayed = false;
    f.evaluate.mockImplementation(async (script, args) => {
        if (script === S.routeReady && !delayed) { delayed = true; expect(args).toEqual(['Loading…', 'Overview', '#/overview']); return false; }
        return inspect(script, args);
    });
    await run(f.driver, 'chrome', f.options, source, pause); expect(pause).toHaveBeenCalledTimes(1);
});
it('bounds unavailable center readiness to150 observations and never touches a control', async () => {
    const f = centerBrowserDriver(); f.evaluate.mockResolvedValue(false); const pause = vi.fn();
    await expect(run(f.driver, 'chrome', f.options, source, pause)).rejects.toThrow('center-ready');
    expect(pause).toHaveBeenCalledTimes(150); expect(f.click).not.toHaveBeenCalled();
});
it('rejects a different engine or version before any page evaluation', async () => {
    for (const capabilities of [{ browserName: 'safari' }, { browserName: 'chrome', browserVersion: '140.0' }]) {
        const f = centerBrowserDriver(); Object.assign(f.driver.capabilities, capabilities);
        await expect(run(f.driver, 'chrome', f.options, source, vi.fn())).rejects.toThrow('assertion:center:');
        expect(f.evaluate).not.toHaveBeenCalled();
    }
});
it('rejects foreign, malformed or parameterized options destinations before page access', async () => {
    for (const uri of ['not a url', 'https://example.invalid/runtime.html', 'chrome-extension://owned/other.html',
        'chrome-extension://owned/runtime.html?copy=1', 'chrome-extension://owned/runtime.html#/appearance']) {
        const f = centerBrowserDriver();
        await expect(run(f.driver, 'chrome', uri, source, vi.fn())).rejects.toThrow('packaged-options-location'); expect(f.evaluate).not.toHaveBeenCalled();
    }
});
it('requires native identity, manifest, loaded source and a closed locale before any setting mutation', async () => {
    for (const change of [null, { root: 'chrome-extension://foreign/' }, { manifest: {} }, { source: 'c'.repeat(64) }, { id: '' }, { locale: 'de' }]) {
        const f = centerBrowserDriver(); const inspect = f.evaluate.getMockImplementation()!;
        f.evaluate.mockImplementation(async (script, args) => script === S.metadata ? change === null ? null : { ...f.metadata(), ...change } : inspect(script, args));
        await expect(run(f.driver, 'chrome', f.options, source, vi.fn())).rejects.toThrow('assertion:center:'); expect(f.click).not.toHaveBeenCalled();
    }
});
it('requires the actual background source and ready state before opening configuration', async () => {
    for (const background of [null, { source: 'wrong', state: 'ready' }, { source: source.sourceTreeSha256, state: 'unavailable' }]) {
        const f = centerBrowserDriver(); f.evaluateAsync.mockResolvedValueOnce(background);
        await expect(run(f.driver, 'chrome', f.options, source, vi.fn())).rejects.toThrow('loaded-background-source'); expect(f.click).not.toHaveBeenCalled();
    }
});
it('rejects malformed snapshots and existing preferences rather than overwriting an unexpected profile', async () => {
    for (const value of [null, {}, { envelope: 'x'.repeat(262145), theme: 'github', revision: 0 }, { envelope: 'null', theme: 'foreign', revision: 0 },
        { envelope: 'null', theme: 'github', revision: -1 }, { envelope: '{}', theme: 'dark', revision: 3 }]) {
        const f = centerBrowserDriver(); const inspect = f.evaluateAsync.getMockImplementation()!;
        f.evaluateAsync.mockImplementation(async script => script === S.snapshot ? value : inspect(script));
        await expect(run(f.driver, 'chrome', f.options, source, vi.fn())).rejects.toThrow('assertion:center:'); expect(f.click).not.toHaveBeenCalled();
    }
});
it('detects a preview write, a cancelled write and an incorrect committed revision independently', async () => {
    for (const [read, expected] of [[2, 'preview-no-write'], [3, 'cancel-no-write'], [4, 'confirmed-complete-revision']] as const) {
        const f = centerBrowserDriver(); const inspect = f.evaluateAsync.getMockImplementation()!; let reads = 0;
        f.evaluateAsync.mockImplementation(async script => script === S.snapshot && ++reads === read ? { envelope: 'unexpected', theme: 'github', revision: 9 } : inspect(script));
        await expect(run(f.driver, 'chrome', f.options, source, vi.fn())).rejects.toThrow(expected);
        expect(f.driver.navigate).not.toHaveBeenCalled();
    }
});
it('rejects stale route provenance before accepting navigation evidence', async () => {
    const f = centerBrowserDriver(); const inspect = f.evaluate.getMockImplementation()!;
    f.evaluate.mockImplementation(async (script, args) => script === S.route ? { heading: 'Overview', active: '#/overview', source: 'stale' } : inspect(script, args));
    await expect(run(f.driver, 'chrome', f.options, source, vi.fn())).rejects.toThrow('route-overview-source-heading'); expect(f.driver.navigate).not.toHaveBeenCalled();
});
it('rejects a fabricated document reload and provider cleanup failures without presenting a native pass', async () => {
    const f = centerBrowserDriver(); const inspect = f.evaluate.getMockImplementation()!;
    f.evaluate.mockImplementation(async (script, args) => script === S.timeOrigin ? 1 : inspect(script, args));
    await expect(run(f.driver, 'chrome', f.options, source, vi.fn())).rejects.toThrow('real-document-recreated');
    for (const providers of [null, { local: false, session: true, clean: true }, { local: true, session: false, clean: true }, { local: true, session: true, clean: false }]) {
        const g = centerBrowserDriver(); const inspectAsync = g.evaluateAsync.getMockImplementation()!;
        g.evaluateAsync.mockImplementation(async script => script === S.providers ? providers : inspectAsync(script));
        await expect(run(g.driver, 'chrome', g.options, source, vi.fn())).rejects.toThrow('native-local-session-provider-roundtrip-cleanup');
    }
});
