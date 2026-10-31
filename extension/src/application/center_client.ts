import { decodeCenterDocument, decodeCenterIdentity, decodeCenterOutcome, decodeCenterPreview, type CenterIdentity, type CenterPlan } from '../domain/center_reply.ts';
import type { CenterRequestMessage } from '../domain/center_protocol.ts';
import { requestConnectionContext, type ConnectionInput } from './center_connection_context.ts';
import type { CenterClientView } from '../domain/center_client_view.ts';
import { sameSettingsContent } from '../domain/settings_operation.ts';
import { deepFreeze } from '../domain/value.ts';
import type { PauseRequest } from '../domain/pause_request.ts';
import { requestHistoryContext, requestPauseContext, requestSessionPreferenceContext } from './center_request_context.ts';
import type { SessionPreferenceRequest } from '../domain/session_preference_request.ts';
import type { HistoryRequest } from '../domain/history_request.ts';
import { uncertainSettingsOutcome as uncertain, publicSettingsReview as publicReview } from '../domain/settings_review_projection.ts';
import { RecentsClient } from './recents_client.ts';
import { readCurrentOperation, readHelperSample, observationContextChanged } from './center_observation_context.ts';
import { retiredCenterReview, observedSubmittedSettings, type SubmittedSettings } from '../domain/center_retirement.ts';
import { centerResponse } from './center_response.ts';
import { requestApiCacheContext } from './api_cache_context.ts';
import type { ApiCacheRequest } from '../domain/api_cache_request.ts';
export interface CenterClientPort { readonly sourceTree: string; send(message: CenterRequestMessage): Promise<unknown>; contextChanged?(): void }
/** One mounted view; reusable authority stays private, while committed receipts are inspectable facts. */
export class CenterClient {
    private owner: CenterIdentity | null = null;
    private pending: CenterPlan | null = null;
    private attempted: SubmittedSettings | null = null;
    private generation = 0;
    private connectionGeneration = 0;
    private stopped = false;
    private busy = false;
    private queuedRead = false;
    private readonly listeners = new Set<(view: CenterClientView) => void>();
    private value: CenterClientView = deepFreeze({ phase: 'loading', data: null, review: null, issue: null });
    private readonly recents: RecentsClient;
    private visitTracking = false;
    constructor(private readonly port: CenterClientPort) {
        this.recents = new RecentsClient({ identity: () => this.owner, request: message => this.request(message, true), changed: () => this.update({}) });
    }
    get visitDelivery() { return this.recents.view; }
    refreshVisitCapture(): Promise<void> { return this.visitTracking ? this.recents.refresh() : Promise.resolve(); }
    startVisitCapture(): Promise<void> { this.visitTracking = true; return this.recents.refresh(); }
    observeDestination(location: unknown): boolean { return this.recents.observe(location); }
    readOperation(): Promise<Record<string, unknown> | null> { return readCurrentOperation(this.owner, this.stopped, message => this.request(message, true), () => this.owner); }
    readHelperSample(): Promise<Record<string, unknown> | null> { return readHelperSample(this.owner, this.stopped || this.value.issue === 'incompatible', message => this.request(message, true), () => this.owner); }
    get view(): CenterClientView { return this.value; }
    disconnected(): void {
        if (this.stopped) return;
        this.generation++; this.connectionGeneration++; this.busy = false; this.queuedRead = false;
        this.pending = null; this.owner = null; this.recents.contextChanged();
        this.update({ phase: 'ready', issue: this.value.issue === 'incompatible' ? 'incompatible' : 'unavailable', role: null, connections: null, review: retiredCenterReview(this.value.review) });
    }
    invalidateConnections(): void { if (!this.stopped) { this.connectionGeneration++; this.update({ connections: null }); } }
    subscribe(listener: (view: CenterClientView) => void): () => void {
        if (this.listeners.size >= 8) throw new Error('center-subscriber-capacity');
        this.listeners.add(listener); listener(this.value); return () => { this.listeners.delete(listener); };
    }
    private update(change: Partial<CenterClientView>): void {
        this.value = deepFreeze({ ...this.value, ...change });
        for (const listener of this.listeners) { try { listener(this.value); } catch { /* One renderer cannot erase saved facts. */ } }
    }
    private current(generation: number): boolean { return !this.stopped && this.generation === generation; }
    private async request(message: CenterRequestMessage, secondary = false): Promise<Record<string, unknown> | null> {
        const generation = this.generation;
        const response = await centerResponse(this.port.sourceTree, () => this.port.send(message));
        if (response.state === 'received') return response.value;
        if (this.current(generation)) {
            const mismatch = response.state === 'incompatible';
            if (mismatch) { this.owner = null; this.recents.contextChanged(); this.pending = null; this.update({ role: null, connections: null }); }
            if (!secondary || mismatch) this.update({ issue: response.state,
                review: mismatch && this.value.review ? { ...this.value.review, state: 'stale' } : this.value.review });
        }
        return null;
    }
    async requestHistory(input: HistoryRequest): Promise<Record<string, unknown> | null> { return requestHistoryContext(input, this.owner, this.stopped || this.value.issue === 'incompatible', this.busy || !!this.value.review, message => this.request(message, true)); }
    requestPauses(input: PauseRequest): Promise<Record<string, unknown> | null> {
        return requestPauseContext(input, this.owner, this.stopped || this.value.issue === 'incompatible', ['claiming', 'previewing', 'committing'].includes(this.value.phase) || !!this.value.review,
            message => this.request(message, true), () => this.owner);
    }
    requestSessionPreferences(input: SessionPreferenceRequest): Promise<Record<string, unknown> | null> {
        return requestSessionPreferenceContext(input, this.owner, this.stopped || this.value.issue === 'incompatible', ['claiming', 'previewing', 'committing'].includes(this.value.phase) || !!this.value.review,
            message => this.request(message, true), () => this.owner);
    }
    requestApiCache(input: ApiCacheRequest): Promise<Record<string, unknown> | null> { return requestApiCacheContext(input, this.owner, this.stopped || this.value.issue === 'incompatible', ['claiming', 'previewing', 'committing'].includes(this.value.phase) || !!this.value.review, message => this.request(message, true), () => this.owner); }
    private async finish(generation: number): Promise<void> {
        if (!this.current(generation)) return;
        this.busy = false; this.update({ phase: 'ready' });
        const read = this.queuedRead; this.queuedRead = false;
        if (read && this.value.issue !== 'incompatible') await this.refreshActive();
    }
    async start(): Promise<void> {
        if (this.stopped || this.busy) return;
        this.busy = true; const generation = ++this.generation;
        this.pending = null; this.owner = null; this.recents.contextChanged(); this.update({ phase: 'loading', issue: null, review: this.attempted ? publicReview(this.attempted.plan, 'unknown', uncertain()) : this.value.review?.state === 'saved' ? this.value.review : null, role: null, connections: null });
        if (!this.current(generation)) return;
        const owner = decodeCenterIdentity(await this.request({ version: 1, method: 'center.open' }));
        if (!this.current(generation)) {
            if (owner) await this.request({ version: 1, method: 'center.close', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch });
            return;
        }
        if (owner) { this.owner = owner; this.update({ role: owner.role }); await this.load(generation); }
        else if (!this.value.issue) this.update({ issue: 'unavailable' });
        await this.finish(generation);
    }
    refreshActive(): Promise<void> { return this.owner ? this.refresh() : Promise.resolve(); }
    async refresh(): Promise<void> {
        if (this.stopped) return;
        if (this.busy) { this.queuedRead = true; return; }
        if (!this.owner) { await this.start(); return; }
        this.busy = true; const generation = this.generation;
        this.update({ phase: 'reading' }); if (!this.current(generation)) return;
        await this.load(generation); await this.finish(generation);
    }
    private async load(generation: number): Promise<void> {
        if (!this.current(generation)) return;
        const owner = this.owner!;
        const body = await this.request({ version: 1, method: 'center.read', clientId: owner.clientId });
        if (!this.current(generation)) return;
        const document = decodeCenterDocument(body);
        if (!document || document.identity.clientId !== owner.clientId) {
            if (body?.state === 'stale') {
                const review = this.pending ? publicReview(this.pending, 'stale') : this.value.review;
                this.owner = null; this.recents.contextChanged(); this.pending = null; this.update({ issue: 'stale', review, role: null, connections: null });
            }
            else if (!this.value.issue) this.update({ issue: 'unavailable' });
            return;
        }
        this.owner = document.identity;
        observationContextChanged(owner, document.identity, () => this.port.contextChanged?.());
        if (this.visitTracking) void this.recents.refresh();
        const { identity: identity, ...data } = document;
        let review = this.value.review;
        if (this.pending && (!document.settings || !sameSettingsContent(document.settings, this.pending.before)
            || identity.role !== 'editor' || identity.controllerEpoch !== owner.controllerEpoch || identity.credentialEpoch !== owner.credentialEpoch)) {
            review = publicReview(this.pending, 'stale'); this.pending = null;
        }
        const observed = observedSubmittedSettings(this.attempted, document);
        if (observed) { review = observed; this.attempted = null; }
        const connections = this.value.connections;
        this.update({ data: { ...data, role: identity.role }, role: identity.role, review, issue: null,
            ...(connections?.state === 'ready' && connections.credentialEpoch !== identity.credentialEpoch ? { connections: null } : {}) });
    }
    async takeControl(): Promise<void> {
        if (this.stopped || !this.owner || this.busy && (this.owner.role !== 'observer' || !['loading', 'reading'].includes(this.value.phase))) return;
        this.busy = true; const generation = ++this.generation; const owner = this.owner;
        this.pending = null; this.update({ phase: 'claiming', review: null, issue: null }); if (!this.current(generation)) return;
        const next = decodeCenterIdentity(await this.request({ version: 1, method: 'center.claim', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch }));
        if (this.current(generation)) {
            if (next && next.clientId === owner.clientId) { this.owner = next; this.recents.contextChanged(); this.update({ role: next.role, phase: 'reading' }); await this.load(generation); }
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
        this.attempted = null;
        this.busy = true; const generation = this.generation; const owner = this.owner;
        this.update({ phase: 'previewing', issue: null }); if (!this.current(generation)) return;
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
    async connections(input: ConnectionInput = null, expectedRevision = 0): Promise<number | null> {
        if (this.stopped || this.busy || !this.owner || this.value.review) return null;
        const owner = this.owner; const generation = this.generation; const connectionGeneration = this.connectionGeneration;
        if (input && owner.role !== 'editor') { this.update({ connections: { state: 'denied' } }); return null; }
        this.busy = true; this.update({ phase: input ? 'committing' : 'reading' });
        const result = await requestConnectionContext(input, expectedRevision, owner, () => this.current(generation), message => this.request(message));
        if (result.state === 'stale' || !this.current(generation)) return null;
        if (result.state === 'not-sent') { this.update({ connections: { state: result.issue } }); await this.finish(generation); return null; }
        if (connectionGeneration === this.connectionGeneration) this.update({ connections: result.response ?? { state: result.submitted ? 'unknown' : 'unavailable' } });
        this.queuedRead = true;
        await this.finish(generation); return this.current(generation) && result.submitted && result.response?.state === 'ready' ? result.response.revision : null;
    }
    private async complete(method: 'center.confirm' | 'center.cancel'): Promise<void> {
        if (this.stopped || this.busy || !this.owner || !this.pending) return;
        if (method === 'center.confirm' && this.value.issue !== null) return;
        const plan = this.pending; const owner = this.owner; const generation = this.generation;
        this.pending = null; this.busy = true;
        if (method === 'center.confirm') this.attempted = { plan, owner };
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
        this.stopped = true; this.recents.stop(); this.generation++; this.pending = null; this.attempted = null; this.listeners.clear();
        const owner = this.owner; this.owner = null; this.update({ phase: 'stopped', review: null, connections: null });
        if (owner) void this.request({ version: 1, method: 'center.close', clientId: owner.clientId, controllerEpoch: owner.controllerEpoch });
    }
}
