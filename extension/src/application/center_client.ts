import { centerPayload, decodeCenterDocument, decodeCenterIdentity, decodeCenterOutcome, decodeCenterPreview, type CenterIdentity, type CenterPlan } from '../domain/center_reply.ts';
import type { CenterMessage } from '../domain/center_protocol.ts';
import type { CenterClientView, ClientReview } from '../domain/center_client_view.ts';
import { sameSettingsContent } from '../domain/settings_operation.ts';
import { deepFreeze, record } from '../domain/value.ts';
import type { SettingsOperationOutcome } from '../domain/settings_result.ts';

export interface CenterClientPort { readonly sourceTree: string; send(message: CenterMessage): Promise<unknown> }
const uncertain = (): SettingsOperationOutcome => ({ state: 'unknown', acknowledgement: 'unknown', observedRevision: null, observation: 'unavailable' });
const publicReview = (plan: CenterPlan, state: ClientReview['state'], outcome?: SettingsOperationOutcome): ClientReview => {
    const { operationId: _id, state: _state, ...view } = plan;
    return { ...view, state, ...(outcome ? { outcome } : {}) };
};

/** One mounted view; reusable authority stays private, while committed receipts are inspectable facts. */
export class CenterClient {
    private owner: CenterIdentity | null = null;
    private pending: CenterPlan | null = null;
    private attempted: CenterPlan | null = null;
    private generation = 0;
    private stopped = false;
    private busy = false;
    private queuedRead = false;
    private readonly listeners = new Set<(view: CenterClientView) => void>();
    private value: CenterClientView = deepFreeze({ phase: 'loading', data: null, review: null, issue: null });
    constructor(private readonly port: CenterClientPort) {}
    get view(): CenterClientView { return this.value; }
    subscribe(listener: (view: CenterClientView) => void): () => void {
        if (this.listeners.size >= 8) throw new Error('center-subscriber-capacity');
        this.listeners.add(listener); listener(this.value); return () => { this.listeners.delete(listener); };
    }
    private update(change: Partial<CenterClientView>): void {
        this.value = deepFreeze({ ...this.value, ...change });
        for (const listener of this.listeners) { try { listener(this.value); } catch { /* One renderer cannot erase saved facts. */ } }
    }
    private current(generation: number): boolean { return !this.stopped && this.generation === generation; }
    private async request(message: CenterMessage): Promise<Record<string, unknown> | null> {
        try {
            const response = await this.port.send(message);
            const payload = centerPayload(response, this.port.sourceTree);
            if (!payload && !this.stopped) {
                const mismatch = record(response) && response.sourceTree !== this.port.sourceTree;
                if (mismatch) { this.owner = null; this.pending = null; }
                this.update({ issue: mismatch ? 'incompatible' : 'unavailable',
                    review: mismatch && this.value.review ? { ...this.value.review, state: 'stale' } : this.value.review });
            }
            return payload;
        } catch { if (!this.stopped) this.update({ issue: 'unavailable' }); return null; }
    }
    private async finish(generation: number): Promise<void> {
        if (!this.current(generation)) return;
        this.busy = false; this.update({ phase: 'ready' });
        if (this.queuedRead) { this.queuedRead = false; await this.refresh(); }
    }
    async start(): Promise<void> {
        if (this.stopped || this.busy) return;
        this.busy = true; const generation = ++this.generation;
        this.pending = null; this.attempted = null; this.owner = null;
        this.update({ phase: 'loading', issue: null, review: null });
        if (!this.current(generation)) return;
        const owner = decodeCenterIdentity(await this.request({ version: 1, method: 'center.open' }));
        if (!this.current(generation)) {
            if (owner) await this.request({ version: 1, method: 'center.close', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch });
            return;
        }
        if (owner) { this.owner = owner; await this.load(generation); }
        else if (!this.value.issue) this.update({ issue: 'unavailable' });
        await this.finish(generation);
    }
    async refresh(): Promise<void> {
        if (this.stopped) return;
        if (this.busy) { this.queuedRead = true; return; }
        if (!this.owner) { await this.start(); return; }
        this.busy = true; const generation = this.generation;
        this.update({ phase: 'reading' }); if (!this.current(generation)) return;
        await this.load(generation); await this.finish(generation);
    }
    private async load(generation: number): Promise<void> {
        const owner = this.owner!;
        const body = await this.request({ version: 1, method: 'center.read', clientId: owner.clientId });
        if (!this.current(generation)) return;
        const document = decodeCenterDocument(body);
        if (!document || document.identity.clientId !== owner.clientId) {
            if (body?.state === 'stale') {
                const review = this.pending ? publicReview(this.pending, 'stale') : this.value.review;
                this.owner = null; this.pending = null; this.update({ issue: 'stale', review });
            }
            else if (!this.value.issue) this.update({ issue: 'unavailable' });
            return;
        }
        this.owner = document.identity;
        const { identity: identity, ...data } = document;
        let review = this.value.review;
        if (this.pending && (!document.settings || !sameSettingsContent(document.settings, this.pending.before)
            || identity.role !== 'editor' || identity.controllerEpoch !== owner.controllerEpoch || identity.credentialEpoch !== owner.credentialEpoch)) {
            review = publicReview(this.pending, 'stale'); this.pending = null;
        }
        if (this.attempted && document.settings && document.lastOperation?.id === this.attempted.operationId
            && document.lastOperation.beforeRevision === this.attempted.revision
            && sameSettingsContent(document.settings, { ...this.attempted.after, revision: this.attempted.revision + 1 })) {
            review = publicReview(this.attempted, 'saved', { state: 'committed', revision: document.settings.revision,
                acknowledgement: 'unknown', current: identity.controllerEpoch === owner.controllerEpoch && identity.credentialEpoch === owner.credentialEpoch });
            this.attempted = null;
        }
        this.update({ data: { ...data, role: identity.role }, review, issue: null });
    }
    async takeControl(): Promise<void> {
        if (this.stopped || this.busy || !this.owner) return;
        this.busy = true; const generation = ++this.generation; const owner = this.owner;
        this.pending = null; this.update({ phase: 'reading', review: null, issue: null });
        if (!this.current(generation)) return;
        const next = decodeCenterIdentity(await this.request({ version: 1, method: 'center.claim', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch }));
        if (this.current(generation)) {
            if (next && next.clientId === owner.clientId) { this.owner = next; await this.load(generation); }
            else this.update({ issue: 'stale' });
        } else if (next && next.clientId === owner.clientId) {
            await this.request({ version: 1, method: 'center.close', clientId: next.clientId, controllerEpoch: next.controllerEpoch });
        }
        await this.finish(generation);
    }
    async preview(intent: unknown, expectedRevision: number): Promise<void> {
        if (this.stopped || this.busy || this.value.review || !this.owner || this.value.data?.state !== 'ready'
            || (this.value.issue !== null && !['invalid', 'unchanged'].includes(this.value.issue))) return;
        if (this.owner.role !== 'editor') { this.update({ issue: 'denied' }); return; }
        this.busy = true; const generation = this.generation; const owner = this.owner;
        this.update({ phase: 'previewing', issue: null });
        if (!this.current(generation)) return;
        const result = decodeCenterPreview(await this.request({ version: 1, method: 'center.preview',
            clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch,
            expectedRevision, intent }));
        if (this.current(generation)) {
            if (result?.state === 'preview') {
                this.pending = result; this.update({ review: publicReview(result, 'preview') });
            } else if (result) {
                const issue = ['stale', 'denied', 'busy', 'invalid', 'unchanged', 'conflict'].includes(result.state)
                    ? result.state as CenterClientView['issue'] : 'unavailable';
                this.update({ issue });
            } else if (!this.value.issue) this.update({ issue: 'unavailable' });
        }
        await this.finish(generation);
    }
    async confirm(): Promise<void> { await this.complete('center.confirm'); }
    async cancel(): Promise<void> { await this.complete('center.cancel'); }
    private async complete(method: 'center.confirm' | 'center.cancel'): Promise<void> {
        if (this.stopped || this.busy || !this.owner || !this.pending) return;
        if (method === 'center.confirm' && this.value.issue !== null) return;
        const plan = this.pending; const owner = this.owner; const generation = this.generation;
        this.pending = null; this.busy = true;
        if (method === 'center.confirm') this.attempted = plan;
        this.update({ phase: 'committing', review: publicReview(plan, 'committing'), issue: null });
        if (!this.current(generation)) return;
        const result = decodeCenterOutcome(await this.request({ version: 1, method,
            clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch,
            operationId: plan.operationId, expectedRevision: plan.revision }));
        if (!this.current(generation)) return;
        const outcome = result && (!('revision' in result) || result.revision === plan.revision + 1) ? result : uncertain();
        const state = outcome.state === 'committed' || outcome.state === 'replayed' ? 'saved'
            : outcome.state === 'cancelled' ? 'cancelled' : outcome.state === 'unknown' ? 'unknown'
                : outcome.state === 'conflict' ? 'conflict' : outcome.state === 'stale' || outcome.state === 'expired' ? 'stale' : 'unavailable';
        if (state !== 'unknown') this.attempted = null;
        this.update({ review: publicReview(plan, state, outcome), issue: state === 'unknown' ? this.value.issue ?? 'unavailable' : null });
        if (state === 'saved') this.queuedRead = true;
        await this.finish(generation);
    }
    async dismiss(): Promise<void> {
        if (this.busy && (this.pending || this.value.review?.state === 'committing')) return;
        if (this.pending) { await this.cancel(); return; }
        this.update({ review: null });
    }
    stop(): void {
        if (this.stopped) return;
        this.stopped = true; this.generation++; this.pending = null; this.attempted = null; this.listeners.clear();
        const owner = this.owner; this.owner = null; this.update({ phase: 'stopped', review: null });
        if (owner) void this.request({ version: 1, method: 'center.close', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch });
    }
}
