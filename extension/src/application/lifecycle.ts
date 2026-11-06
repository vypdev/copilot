import { sameEpoch } from '../domain/page.ts';
import type { FeatureController, ResourceScope, RuntimeContext, RuntimeFeature, RuntimePorts } from './runtime_ports.ts';
import type { RuntimeFaultCode } from '../domain/runtime_health.ts';

interface Mounted {
    readonly scope: ResourceScope;
    readonly generation: number;
    controller?: FeatureController;
    refreshing: boolean;
    again: boolean;
}
/** One coordinator per content generation. Features have independent resource ownership. */
export class FeatureRuntime {
    private context: RuntimeContext | undefined;
    private generation = 0;
    private readonly mounted = new Map<string, Mounted>();
    private readonly disabled = new Set<string>();
    constructor(private readonly features: readonly RuntimeFeature[], private readonly ports: RuntimePorts) {
        if (new Set(features.map(feature => feature.id)).size !== features.length) throw new Error('duplicate-feature');
    }
    async update(context: RuntimeContext): Promise<void> {
        const previous = this.context;
        const changed = !previous || previous.page.route !== context.page.route || previous.page.object !== context.page.object
            || !sameEpoch(previous.epochs, context.epochs) || previous.configurationEpoch !== context.configurationEpoch;
        this.context = context;
        if (changed) { this.generation++; this.releaseAll(); }
        const generation = this.generation;
        await Promise.all(this.features.map(async feature => {
            if (generation !== this.generation) return;
            const existing = this.mounted.get(feature.id);
            try { if (context.paused && feature.purpose !== 'local-control' || this.disabled.has(feature.id) || !feature.enabled(context)) { if (existing) this.release(feature.id, existing); return; } }
            catch { this.diagnostic(feature.id, 'mount-failed', existing ? this.current(existing.scope) : generation === this.generation);
                if (existing) this.release(feature.id, existing); return; }
            if (generation !== this.generation || this.mounted.get(feature.id) !== existing) return;
            if (existing) { await this.refresh(feature.id, existing); return; }
            let scope: ResourceScope | undefined;
            try { scope = this.ports.scope(() => scope !== undefined && generation === this.generation && this.mounted.get(feature.id)?.scope === scope); }
            catch { this.diagnostic(feature.id, 'mount-failed', generation === this.generation); return; }
            const item: Mounted = { scope, generation, refreshing: false, again: false };
            this.mounted.set(feature.id, item);
            try {
                const controller = await feature.mount(context, scope);
                scope.own(() => controller.dispose());
                if (this.current(scope)) {
                    item.controller = controller;
                    if (item.again) { item.again = false; await this.refresh(feature.id, item); }
                }
            } catch { this.diagnostic(feature.id, 'mount-failed', this.current(scope)); this.release(feature.id, item); }
        }));
    }
    pause(featureId: string, paused: boolean): void {
        if (paused) { this.disabled.add(featureId); this.release(featureId); }
        else this.disabled.delete(featureId);
    }
    dispose(): void { this.generation++; this.context = undefined; this.releaseAll(); }
    private async refresh(id: string, item: Mounted): Promise<void> {
        if (item.refreshing) { item.again = true; return; }
        if (!item.controller) { item.again = true; return; }
        item.refreshing = true;
        try {
            // At most two passes; a storm cannot keep a feature alive indefinitely.
            await item.controller.refresh();
            if (item.again && this.current(item.scope)) { item.again = false; await item.controller.refresh(); }
        } catch { this.diagnostic(id, 'refresh-failed', this.current(item.scope)); this.release(id, item); }
        finally { item.refreshing = false; item.again = false; }
    }
    private release(id: string, expected?: Mounted): void {
        const item = this.mounted.get(id);
        if (!item || (expected && item !== expected)) return;
        const current = this.current(item.scope);
        this.mounted.delete(id);
        try { item.scope.dispose(); } catch { this.diagnostic(id, 'cleanup-failed', current && item.generation === this.generation && !this.mounted.has(id)); }
    }
    private diagnostic(id: string, code: RuntimeFaultCode, current: boolean): void {
        try { this.ports.diagnostic(id, code, current); } catch { /* Diagnostic delivery cannot break another feature or prevent resource cleanup. */ }
    }
    private current(scope: ResourceScope): boolean { try { return scope.current() === true; } catch { return false; } }
    private releaseAll(): void { for (const [id, item] of [...this.mounted]) this.release(id, item); }
}
