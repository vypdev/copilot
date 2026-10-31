import { decodeApiCacheReply, type ApiCacheOutcome, type ApiCachePreview, type ApiCacheReply } from '../domain/api_cache.ts';
import { EMPTY_API_CACHE_VIEW, type ApiCacheView } from '../domain/api_cache_ui.ts';
import type { ApiCacheRequest } from '../domain/api_cache_request.ts';
import { deepFreeze, natural } from '../domain/value.ts';

interface Ports { request(input: ApiCacheRequest): Promise<unknown>; canReview(): boolean; canInspect(): boolean; now(): number; changed(): void }
/** One view, one private retained selector; a lost acknowledgement never triggers a repeated clear. */
export class ApiCacheClient {
    private value = EMPTY_API_CACHE_VIEW;
    private retained: ApiCachePreview | null = null;
    private generation = 0;
    private stopped = false;
    constructor(private readonly ports: Ports) {}
    get view(): ApiCacheView { return this.value; }
    get busy(): boolean { return this.value.phase !== 'idle'; }
    get held(): boolean { return this.busy || this.value.open; }
    private publish(change: Partial<ApiCacheView>): void {
        this.value = deepFreeze({ ...this.value, ...change, retained: this.retained !== null });
        try { this.ports.changed(); } catch { /* Delivery cannot submit or repeat a native operation. */ }
    }
    private current(generation: number): boolean { return !this.stopped && generation === this.generation; }
    private async request(input: ApiCacheRequest): Promise<ApiCacheReply | null> {
        try { return decodeApiCacheReply(await this.ports.request(input)); } catch { return null; }
    }
    private fresh(preview: ApiCachePreview): boolean {
        try { const now = this.ports.now(); return natural(now) && preview.expiresAt > now && preview.expiresAt <= now + 300_000; } catch { return false; }
    }
    async preview(): Promise<void> {
        if (this.stopped || this.held || !this.ports.canReview() || this.retained && ['preview', 'not-submitted'].includes(this.value.status!)) return;
        const generation = this.generation; const prior = this.retained;
        const unresolved = this.value.status !== 'cleared' && this.value.status !== 'cancelled' && this.value.status !== 'expired';
        this.retained = null;
        this.publish({ phase: 'reviewing', open: true });
        if (!this.current(generation)) return;
        const result = await this.request({ method: 'center.cache.preview' });
        if (!this.current(generation)) return;
        if (result?.state === 'preview' && this.fresh(result)) {
            this.retained = result; this.publish({ phase: 'idle', status: 'preview' });
        } else {
            // Only an explicit refusal certifies that no new review replaced the prior selector.
            if (result?.state === 'busy' && unresolved) this.retained = prior;
            this.publish({ phase: 'idle', status: result && result.state !== 'preview' ? result.state : 'unavailable' });
        }
    }
    async confirm(): Promise<void> {
        if (this.stopped || this.busy || !this.value.open || this.value.status !== 'preview' || !this.retained || !this.ports.canReview()) return;
        if (!this.fresh(this.retained)) { this.publish({ status: 'expired' }); return; }
        await this.complete('center.cache.confirm', 'confirming');
    }
    async cancel(): Promise<void> {
        if (this.stopped || this.busy || !this.retained || this.value.status === 'cleared' || this.value.status === 'cancelled' || !this.ports.canInspect()) return;
        await this.complete('center.cache.cancel', 'cancelling');
    }
    async inspect(): Promise<void> {
        if (this.stopped || this.busy || !this.retained || !this.ports.canInspect()) return;
        const before = this.value.status; const generation = this.generation; const operationId = this.retained.operationId;
        this.publish({ phase: 'reading', open: true });
        if (!this.current(generation)) return;
        const result = await this.request({ method: 'center.cache.result', operationId });
        if (!this.current(generation)) return;
        const status = result && result.state !== 'preview' ? result.state
            : before === 'cleared' || before === 'cancelled' ? before : 'unknown';
        this.publish({ phase: 'idle', status });
    }
    private async complete(method: 'center.cache.confirm' | 'center.cache.cancel', phase: 'confirming' | 'cancelling'): Promise<void> {
        const generation = this.generation; const operationId = this.retained!.operationId;
        this.publish({ phase, open: true });
        if (!this.current(generation)) return;
        const result = await this.request({ method, operationId });
        if (!this.current(generation)) return;
        const status: ApiCacheOutcome['state'] = result && result.state !== 'preview' && result.state !== 'not-submitted' ? result.state : 'unknown';
        this.publish({ phase: 'idle', status });
    }
    async dismiss(): Promise<boolean> {
        if (this.busy) return false;
        if (this.value.open && (this.value.status === 'preview' || this.value.status === 'not-submitted')) {
            await this.cancel(); if (this.view.status !== 'cancelled') return false;
        }
        this.publish({ open: false }); return true;
    }
    contextChanged(): void {
        if (this.stopped) return;
        const observed = this.value.open || this.busy || this.retained !== null || this.value.status !== null;
        this.generation++; this.retained = null;
        this.publish({ phase: 'idle', status: observed ? 'stale' : null });
    }
    stop(): void { if (this.stopped) return; this.stopped = true; this.generation++; this.retained = null; this.value = EMPTY_API_CACHE_VIEW; }
}
