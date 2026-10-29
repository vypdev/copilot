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
    expect(h.scopes[1].current()).toBe(true); expect(h.diagnostic).toHaveBeenCalledWith('first', 'mount-failed', false);
    runtime.dispose(); expect(h.controller.dispose).toHaveBeenCalledTimes(1);
});
it('isolates mounting/refresh/cleanup exceptions and always releases the remaining owned resources', async () => {
    const h = harness(); const bad = { ...h.feature, id: 'bad', mount: vi.fn(() => { throw new Error('secret'); }) };
    const runtime = new FeatureRuntime([h.feature, bad], h.ports); await runtime.update(context());
    h.controller.refresh.mockImplementation(() => { throw new Error('secret'); }); await runtime.update(context());
    expect(h.diagnostic).toHaveBeenCalledWith('first', 'refresh-failed', true);
    h.controller.dispose.mockImplementation(() => { throw new Error('secret'); });
    await runtime.update(context()); runtime.dispose(); expect(h.diagnostic).toHaveBeenCalledWith('first', 'cleanup-failed', false);
    const scope = new BrowserResourceScope(() => true); const releases: number[] = [];
    scope.own(() => releases.push(1)); scope.own(() => { throw new Error('secret'); }); scope.own(() => releases.push(2));
    expect(() => scope.dispose()).toThrow('cleanup-failed'); expect(releases).toEqual([2, 1]);
    scope.dispose(); scope.own(() => releases.push(3)); expect(releases).toEqual([2, 1, 3]);
});
it('coalesces refresh storms and reconciles a root replacement queued during asynchronous mount', async () => {
    const h = harness(); const mount = deferred<FeatureController>(); const refresh = deferred<void>();
    const feature = { ...h.feature, mount: () => mount.promise }; const runtime = new FeatureRuntime([feature], h.ports);
    const loading = runtime.update(context()); await runtime.update(context()); mount.resolve(h.controller); await loading;
    expect(h.controller.refresh).toHaveBeenCalledTimes(1); h.controller.refresh.mockClear();
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
it.each(['mount', 'refresh', 'cleanup'] as const)('throwing %s diagnostic delivery cannot reject the coordinator or retire an independent controller', async phase => {
    const h = harness(); h.diagnostic.mockImplementation(() => { throw new Error('private-delivery-failed'); });
    const healthy = { id: 'healthy', enabled: () => true, mount: vi.fn(() => ({ refresh: vi.fn(), dispose: vi.fn() })) };
    if (phase === 'mount') h.feature.mount.mockImplementationOnce(() => { throw new Error('private-mount'); });
    const runtime = new FeatureRuntime([h.feature, healthy], h.ports); await expect(runtime.update(context())).resolves.toBeUndefined();
    if (phase === 'refresh') { h.controller.refresh.mockImplementationOnce(() => { throw new Error('private-refresh'); }); await expect(runtime.update(context())).resolves.toBeUndefined(); }
    if (phase === 'cleanup') { h.controller.dispose.mockImplementationOnce(() => { throw new Error('private-cleanup'); }); expect(() => runtime.pause('first', true)).not.toThrow(); }
    expect(healthy.mount).toHaveBeenCalledOnce(); expect(h.scopes[1].current()).toBe(true); expect(h.diagnostic).toHaveBeenCalledWith('first', `${phase}-failed`, true);
    runtime.dispose();
});
it('a retired asynchronous refresh cannot mark the replacement current or dispose its scope', async () => {
    const h = harness(); const wait = deferred<void>(); const runtime = new FeatureRuntime([h.feature], h.ports); await runtime.update(context());
    h.controller.refresh.mockReturnValueOnce(wait.promise); const old = runtime.update(context());
    await runtime.update(context('https://github.com/octo/other/issues/42')); wait.reject(new Error('private-old-failure')); await old;
    expect(h.diagnostic).toHaveBeenCalledWith('first', 'refresh-failed', false); expect(h.scopes[1].current()).toBe(true); runtime.dispose();
});
it.each(['same-generation', 'new-generation'] as const)('a current cleanup failure is tagged retired when cleanup installs a %s replacement', async generation => {
    const h = harness(); const next = { refresh: vi.fn(), dispose: vi.fn() }; let first = true;
    h.feature.mount.mockImplementation(() => { if (first) { first = false; return h.controller; } return next; });
    const runtime = new FeatureRuntime([h.feature], h.ports); await runtime.update(context());
    h.controller.dispose.mockImplementationOnce(() => { h.feature.enabled.mockReturnValue(true);
        void runtime.update(generation === 'same-generation' ? context() : context('https://github.com/octo/other/issues/42')); throw new Error('private-dispose'); });
    h.feature.enabled.mockReturnValue(false); await runtime.update(context());
    expect(h.diagnostic).toHaveBeenCalledWith('first', 'cleanup-failed', false); expect(h.scopes[1].current()).toBe(true); runtime.dispose();
});
it('uninspectable scope liveness is unknown and cannot throw from a failure handler or prevent disposal', async () => {
    const h = harness(); const scope = { current: () => { throw new Error('private-native-liveness'); }, stopped: false, own: vi.fn(), dispose: vi.fn() };
    const runtime = new FeatureRuntime([h.feature], { ...h.ports, scope: () => scope });
    await expect(runtime.update(context())).resolves.toBeUndefined(); expect(() => runtime.dispose()).not.toThrow(); expect(scope.dispose).toHaveBeenCalledOnce();
});
it('a failing eligibility decision retires only its own live controller while independent helpers remain available', async () => {
    const h = harness(); const second = { ...h.feature, id: 'second', enabled: () => true, mount: vi.fn(() => ({ refresh: vi.fn(), dispose: vi.fn() })) };
    const runtime = new FeatureRuntime([h.feature, second], h.ports); await runtime.update(context());
    h.feature.enabled.mockImplementationOnce(() => { throw new Error('private-eligibility'); }); await expect(runtime.update(context())).resolves.toBeUndefined();
    expect(h.diagnostic).toHaveBeenCalledWith('first', 'mount-failed', true); expect(h.scopes[0].stopped).toBe(true); expect(h.scopes[1].current()).toBe(true);
    runtime.dispose();
});
it('a new helper eligibility failure cannot escape before it has allocated an owned resource', async () => {
    const h = harness(); h.feature.enabled.mockImplementationOnce(() => { throw new Error('private-eligibility'); });
    const runtime = new FeatureRuntime([h.feature], h.ports); await expect(runtime.update(context())).resolves.toBeUndefined();
    expect(h.scopes).toHaveLength(0); expect(h.diagnostic).toHaveBeenCalledWith('first', 'mount-failed', true);
});
it('a failing resource factory cannot break a sibling or certify a not-yet-owned scope as current', async () => {
    const h = harness(); let first = true; const create = h.ports.scope;
    const second = { ...h.feature, id: 'second', enabled: () => true, mount: vi.fn(() => ({ refresh: vi.fn(), dispose: vi.fn() })) };
    const runtime = new FeatureRuntime([h.feature, second], { ...h.ports, scope: valid => {
        if (first) { first = false; expect(valid()).toBe(false); throw new Error('private-factory'); } return create(valid);
    } });
    await expect(runtime.update(context())).resolves.toBeUndefined(); expect(h.diagnostic).toHaveBeenCalledWith('first', 'mount-failed', true);
    expect(second.mount).toHaveBeenCalledOnce(); expect(h.scopes[0].current()).toBe(true); runtime.dispose();
});
it.each(['same-generation', 'new-generation'] as const)('eligibility cannot refresh a retired owner after installing a %s replacement', async generation => {
    const h = harness(); const runtime = new FeatureRuntime([h.feature], h.ports); await runtime.update(context());
    h.feature.enabled.mockImplementationOnce(() => {
        if (generation === 'same-generation') { runtime.pause('first', true); runtime.pause('first', false); }
        void runtime.update(generation === 'same-generation' ? context() : context('https://github.com/octo/other/issues/42')); return true;
    });
    await runtime.update(context()); expect(h.scopes[1].current()).toBe(true); expect(h.controller.refresh).not.toHaveBeenCalled(); runtime.dispose();
});
