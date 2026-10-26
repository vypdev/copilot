import { expect, it, vi } from 'vitest';
import { FeatureRuntime } from '../../src/application/lifecycle.ts';
import { BrowserResourceScope } from '../../src/adapters/browser/resource_scope.ts';
import { BrowserCancellation } from '../../src/adapters/browser/cancellation.ts';
import { context, deferred } from '../fixtures/runtime.ts';
import type { FeatureController, ResourceScope, RuntimeFeature } from '../../src/application/runtime_ports.ts';

function harness() {
    const scopes: BrowserResourceScope[] = []; const diagnostic = vi.fn();
    const ports = { scope: (valid: () => boolean) => { const scope = new BrowserResourceScope(valid); scopes.push(scope); return scope; }, diagnostic };
    const controller = { refresh: vi.fn(), dispose: vi.fn() };
    const feature = { id: 'first', enabled: vi.fn(() => true), mount: vi.fn(() => controller) };
    return { scopes, diagnostic, ports, controller, feature };
}
it('github-browser-extension-runtime-C07 mounts once, refreshes, disposes resources once, and rejects duplicate registry IDs', async () => {
    const h = harness(); const runtime = new FeatureRuntime([h.feature], h.ports);
    await runtime.update(context()); await runtime.update(context()); expect(h.feature.mount).toHaveBeenCalledTimes(1);
    expect(h.controller.refresh).toHaveBeenCalledTimes(1); runtime.dispose(); runtime.dispose();
    expect(h.controller.dispose).toHaveBeenCalledTimes(1); expect(h.scopes[0].stopped).toBe(true);
    expect(() => new FeatureRuntime([h.feature, h.feature], h.ports)).toThrow('duplicate-feature');
});
it('github-browser-extension-runtime-C08/github-browser-extension-runtime-C09 fences every epoch and route/native identity, disposes mounting late controllers', async () => {
    for (const key of ['route', 'object', 'settings', 'credential'] as const) {
        const h = harness(); const pending = deferred<FeatureController>();
        let oldScope: ResourceScope;
        const feature = { ...h.feature, mount: vi.fn((_context, scope) => { oldScope = scope; return pending.promise; }) } as RuntimeFeature;
        const runtime = new FeatureRuntime([feature], h.ports); const old = runtime.update(context());
        const next = { ...context(), epochs: { ...context().epochs, [key]: 2 } }; runtime.pause('first', true); await runtime.update(next);
        pending.resolve(h.controller); await old; expect(oldScope!.current()).toBe(false); expect(h.controller.dispose).toHaveBeenCalledTimes(1);
    }
    const h = harness(); const runtime = new FeatureRuntime([h.feature], h.ports); await runtime.update(context());
    await runtime.update({ ...context('https://github.com/octo/example/pull/42') }); expect(h.controller.dispose).toHaveBeenCalledTimes(1);
    await runtime.update({ ...context('https://github.com/octo/example/pull/42'), page: { ...context().page, route: 'https://github.com/octo/example/pull/42', object: 'native-new' } });
    expect(h.controller.dispose).toHaveBeenCalledTimes(2);
});
it('github-browser-extension-runtime-C10 independently pauses features, respects disabled/settings pause, and resumes explicitly', async () => {
    const h = harness(); const second = { ...h.feature, id: 'second', mount: vi.fn(() => ({ refresh: vi.fn(), dispose: vi.fn() })) };
    const runtime = new FeatureRuntime([h.feature, second], h.ports); await runtime.update(context()); runtime.pause('first', true);
    await runtime.update(context()); expect(h.feature.mount).toHaveBeenCalledTimes(1); expect(second.mount).toHaveBeenCalledTimes(1);
    runtime.pause('first', false); await runtime.update(context()); expect(h.feature.mount).toHaveBeenCalledTimes(2);
    h.feature.enabled.mockReturnValue(false); await runtime.update(context()); expect(h.scopes[2].stopped).toBe(true);
    await runtime.update({ ...context(), paused: true }); expect(h.scopes.every(scope => scope.stopped)).toBe(true);
});
it('github-browser-extension-runtime-C14 rapid transitions keep only the final scope and a stale rejection cannot dispose its replacement', async () => {
    const h = harness(); const pending = deferred<FeatureController>(); let first = true;
    const feature = { ...h.feature, mount: vi.fn(() => { if (first) { first = false; return pending.promise; } return h.controller; }) };
    const runtime = new FeatureRuntime([feature], h.ports); const old = runtime.update(context());
    await runtime.update(context('https://github.com/octo/other/issues/42')); pending.reject(new Error('raw secret')); await old;
    expect(h.scopes[1].current()).toBe(true); expect(h.diagnostic).toHaveBeenCalledWith('first', 'mount-failed');
    runtime.dispose(); expect(h.controller.dispose).toHaveBeenCalledTimes(1);
});
it('isolates mounting/refresh/cleanup exceptions and always releases the remaining owned resources', async () => {
    const h = harness(); const bad = { ...h.feature, id: 'bad', mount: vi.fn(() => { throw new Error('secret'); }) };
    const runtime = new FeatureRuntime([h.feature, bad], h.ports); await runtime.update(context());
    h.controller.refresh.mockImplementation(() => { throw new Error('secret'); }); await runtime.update(context());
    expect(h.diagnostic).toHaveBeenCalledWith('first', 'refresh-failed');
    h.controller.dispose.mockImplementation(() => { throw new Error('secret'); });
    await runtime.update(context()); runtime.dispose(); expect(h.diagnostic).toHaveBeenCalledWith('first', 'cleanup-failed');
    const scope = new BrowserResourceScope(() => true); const releases: number[] = [];
    scope.own(() => releases.push(1)); scope.own(() => { throw new Error('secret'); }); scope.own(() => releases.push(2));
    expect(() => scope.dispose()).toThrow('cleanup-failed'); expect(releases).toEqual([2, 1]);
    scope.dispose(); scope.own(() => releases.push(3)); expect(releases).toEqual([2, 1, 3]);
});
it('coalesces refresh storms to bounded passes and ignores refresh until asynchronous mount is complete', async () => {
    const h = harness(); const mount = deferred<FeatureController>(); const refresh = deferred<void>();
    const feature = { ...h.feature, mount: () => mount.promise }; const runtime = new FeatureRuntime([feature], h.ports);
    const loading = runtime.update(context()); await runtime.update(context()); mount.resolve(h.controller); await loading;
    h.controller.refresh.mockReturnValue(refresh.promise); const first = runtime.update(context()); await runtime.update(context());
    refresh.resolve(); await first; expect(h.controller.refresh).toHaveBeenCalledTimes(2);
});
it('reentrant mounting cannot activate the remaining stale feature set', async () => {
    const h = harness();
    const feature = { ...h.feature, mount: () => { runtime.dispose(); return h.controller; } };
    const second = { ...h.feature, id: 'second', mount: vi.fn(() => h.controller) };
    const runtime = new FeatureRuntime([feature, second], h.ports); await runtime.update(context());
    expect(second.mount).not.toHaveBeenCalled(); expect(h.scopes[0].stopped).toBe(true);
});
it('resource scope and cancellation adapters notify once, release listeners and handle already-cancelled operations', () => {
    const scope = new BrowserResourceScope(() => false); expect(scope.current()).toBe(false);
    const owner = new BrowserCancellation(); const first = vi.fn(); const second = vi.fn();
    const release = owner.onAbort(first); release(); owner.onAbort(second); owner.abort(); owner.abort();
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledTimes(1); expect(owner.aborted).toBe(true);
    const late = vi.fn(); owner.onAbort(late)(); expect(late).toHaveBeenCalledTimes(1);
});
