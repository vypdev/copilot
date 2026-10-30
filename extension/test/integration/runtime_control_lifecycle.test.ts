import { expect, it, vi } from 'vitest';
import { FeatureRuntime } from '../../src/application/lifecycle.ts';
import { RuntimeHealth } from '../../src/domain/runtime_health.ts';
import { BrowserResourceScope } from '../../src/adapters/browser/resource_scope.ts';
import type { RuntimeFeature } from '../../src/application/runtime_ports.ts';
import { context, deferred } from '../fixtures/runtime.ts';

function fixture() {
    const local = { dispose: vi.fn(), refresh: vi.fn() }; const enhancement = { dispose: vi.fn(), refresh: vi.fn() };
    const control: RuntimeFeature = { id: 'required-control', purpose: 'local-control', enabled: vi.fn(() => true), mount: vi.fn(() => local) };
    const feature: RuntimeFeature = { id: 'enhancement', enabled: vi.fn(() => true), mount: vi.fn(() => enhancement) };
    const diagnostic = vi.fn(); const runtime = new FeatureRuntime([control, feature], { scope: current => new BrowserResourceScope(current), diagnostic });
    return { runtime, control, feature, local, enhancement, diagnostic };
}
it('a true pause preserves only the explicitly required local control purpose and never rewrites that pause to false', async () => {
    const h = fixture(); const value = { ...context(), paused: true }; await h.runtime.update(value);
    expect(h.control.mount).toHaveBeenCalledOnce(); expect(h.control.mount).toHaveBeenCalledWith(value, expect.anything()); expect(h.feature.mount).not.toHaveBeenCalled(); expect(value.paused).toBe(true); h.runtime.dispose();
});
it('a paused local control still obeys its own disabled/eligibility gates and resource teardown', async () => {
    const h = fixture(); const value = { ...context(), paused: true }; h.runtime.pause(h.control.id, true); await h.runtime.update(value); expect(h.control.mount).not.toHaveBeenCalled();
    h.runtime.pause(h.control.id, false); vi.mocked(h.control.enabled).mockReturnValueOnce(false); await h.runtime.update(value); expect(h.control.mount).not.toHaveBeenCalled();
    await h.runtime.update(value); expect(h.control.mount).toHaveBeenCalledOnce(); h.runtime.dispose(); expect(h.local.dispose).toHaveBeenCalledOnce();
});
it('pending/ready deliveries with identical saved revision and credential epoch retire the previous view rather than retaining its pending copy', async () => {
    const h = fixture(); const value = context(); await h.runtime.update({ ...value, configurationEpoch: 1 }); await h.runtime.update({ ...value, configurationEpoch: 2 });
    expect(h.control.mount).toHaveBeenCalledTimes(2); expect(h.local.dispose).toHaveBeenCalledOnce(); expect(h.control.mount).toHaveBeenLastCalledWith(expect.objectContaining({ configurationEpoch: 2 }), expect.anything()); h.runtime.dispose();
});
it('an old asynchronous control completion cannot regain the new configuration delivery or enhance a paused page', async () => {
    const h = fixture(); const old = deferred<typeof h.local>(); vi.mocked(h.control.mount).mockReturnValueOnce(old.promise); const first = h.runtime.update({ ...context(), paused: true, configurationEpoch: 1 });
    const retired = { dispose: vi.fn(), refresh: vi.fn() };
    await h.runtime.update({ ...context(), paused: true, configurationEpoch: 2 }); old.resolve(retired); await first;
    expect(retired.dispose).toHaveBeenCalledOnce(); expect(h.local.dispose).not.toHaveBeenCalled(); expect(h.feature.mount).not.toHaveBeenCalled(); h.runtime.dispose(); expect(h.local.dispose).toHaveBeenCalledOnce();
});
it('a valid new receipt clears older helper faults while retaining current-source failures without duplicating their observed events', () => {
    const health = new RuntimeHealth(['runtime-health', 'center-shortcuts']); health.record('runtime-health', 'mount-failed', true); health.record('center-shortcuts', 'mount-failed', true);
    health.resetFailures(new Set(['runtime-health', 'foreign'])); expect(health.snapshot().blocked).toEqual(['runtime-health']); expect(health.snapshot().events).toHaveLength(2);
    expect(health.canMount('center-shortcuts')).toBe(true); expect(health.canMount('runtime-health')).toBe(false); health.resetFailures(); expect(health.snapshot().blocked).toEqual([]); expect(health.snapshot().events).toHaveLength(2);
});
