import { sameEpoch } from '../domain/page.ts';
import type { FeatureController, ResourceScope, RuntimeContext, RuntimeFeature, RuntimePorts } from './runtime_ports.ts';

interface Mounted {
    readonly scope: ResourceScope;
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
            || !sameEpoch(previous.epochs, context.epochs);
        this.context = context;
        if (changed) { this.generation++; this.releaseAll(); }
        const generation = this.generation;
        await Promise.all(this.features.map(async feature => {
            if (generation !== this.generation) return;
            if (context.paused || this.disabled.has(feature.id) || !feature.enabled(context)) { this.release(feature.id); return; }
            const existing = this.mounted.get(feature.id);
            if (existing) { await this.refresh(feature.id, existing); return; }
            const scope = this.ports.scope(() => generation === this.generation && this.mounted.get(feature.id)?.scope === scope);
            const item: Mounted = { scope, refreshing: false, again: false };
            this.mounted.set(feature.id, item);
            try {
                const controller = await feature.mount(context, scope);
                scope.own(() => controller.dispose());
                if (scope.current()) item.controller = controller;
            } catch { this.ports.diagnostic(feature.id, 'mount-failed'); this.release(feature.id, item); }
        }));
    }
    pause(featureId: string, paused: boolean): void {
        if (paused) { this.disabled.add(featureId); this.release(featureId); }
        else this.disabled.delete(featureId);
    }
    dispose(): void { this.generation++; this.context = undefined; this.releaseAll(); }
    private async refresh(id: string, item: Mounted): Promise<void> {
        if (item.refreshing) { item.again = true; return; }
        if (!item.controller) return;
        item.refreshing = true;
        try {
            // At most two passes; a storm cannot keep a feature alive indefinitely.
            await item.controller.refresh();
            if (item.again && item.scope.current()) { item.again = false; await item.controller.refresh(); }
        } catch { this.ports.diagnostic(id, 'refresh-failed'); this.release(id, item); }
        finally { item.refreshing = false; item.again = false; }
    }
    private release(id: string, expected?: Mounted): void {
        const item = this.mounted.get(id);
        if (!item || (expected && item !== expected)) return;
        this.mounted.delete(id);
        try { item.scope.dispose(); } catch { this.ports.diagnostic(id, 'cleanup-failed'); }
    }
    private releaseAll(): void { for (const [id, item] of [...this.mounted]) this.release(id, item); }
}
