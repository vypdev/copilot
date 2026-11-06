import { copyPauseReviewIntent, type PauseReviewIntent, type PauseReviewOutcome, type PauseReviewPlan } from '../domain/temporary_pause_review.ts';
import { decodePauseOutcome, decodePausePreview, pauseOutcomeMatches, samePauseSnapshot } from '../domain/pause_reply.ts';
import { publicPauseReview, type PauseReadView, type PauseReviewView, type PauseReviewPhase } from '../domain/pause_client_view.ts';
import type { PauseRequest } from '../domain/pause_request.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { PauseClientPorts } from './pause_client_ports.ts';

interface Review { readonly plan: PauseReviewPlan; readonly intent: PauseReviewIntent; readonly createdAt: number }
interface Attempt { readonly record: Review; version: number; targetCurrent: boolean }
const phase = (value: PauseReviewOutcome | null): PauseReviewPhase => !value || ['unknown', 'pending', 'not-submitted'].includes(value.state) ? 'unknown'
    : ['stale', 'expired', 'denied'].includes(value.state) || 'current' in value && !value.current ? 'stale' : 'result';
/** One user review with private selectors; metadata and later weaker replies cannot certify an unknown effect. */
export class PauseReviewClient {
    private pending: Review | null = null;
    private attempt: Attempt | null = null;
    private serial = 0;
    private inFlight = 0;
    private stopped = false;
    private value: PauseReviewView = deepFreeze({ review: null, busy: false, checking: false, canInspect: false, issue: null });
    constructor(private readonly ports: Omit<PauseClientPorts, 'canRead'>, private readonly observed: (outcome: PauseReviewOutcome | null) => void) {}
    get view(): PauseReviewView { return this.value; }
    private update(change: Partial<PauseReviewView>): void {
        this.value = deepFreeze({ ...this.value, ...change }); try { this.ports.changed(); } catch { /* Delivery never changes effects. */ }
    }
    private allowed(): boolean { try { return this.ports.canMutate() === true; } catch { return false; } }
    private time(): number | null { try { const now = this.ports.now(); return natural(now) ? now : null; } catch { return null; } }
    private async request(input: PauseRequest): Promise<unknown> {
        // Preview admission reserves at most 16 calls; one exact-result inspection can join the current attempt.
        this.inFlight++;
        try { return await this.ports.request(input); } catch { return null; } finally { this.inFlight--; }
    }
    async preview(value: unknown, expectedRevision: number): Promise<void> {
        if (this.stopped || this.value.busy || this.value.review) return;
        if (!this.allowed()) { this.update({ issue: 'denied' }); return; }
        const intent = copyPauseReviewIntent(value);
        if (!intent || !natural(expectedRevision)) { this.update({ issue: 'invalid' }); return; }
        if (this.inFlight >= 16) { this.update({ issue: 'busy' }); return; }
        const serial = ++this.serial; this.update({ busy: true, issue: null });
        if (this.stopped || serial !== this.serial) return;
        if (!this.allowed()) { this.update({ busy: false, issue: 'denied' }); return; }
        const reply = decodePausePreview(await this.request({ method: 'center.pauses.preview', intent, expectedRevision }));
        if (this.stopped || serial !== this.serial) return;
        const now = this.time();
        const matching = reply?.state === 'preview' && reply.revision === expectedRevision && (intent.type === 'adopt-observed'
            ? reply.action === 'adopt-observed' : reply.target.kind === intent.type && (intent.type !== 'tab' || reply.target.kind === 'tab' && reply.target.tabId === intent.tabId)
                && (intent.type === 'emergency' ? reply.after.emergency : reply.after.tabs.includes(intent.tabId)) === intent.paused);
        if (reply?.state === 'preview' && matching && now !== null && now < reply.expiresAt) {
            this.pending = { plan: reply, intent, createdAt: now }; this.attempt = null;
            this.update({ busy: false, review: publicPauseReview(reply, 'preview'), canInspect: false });
        } else this.update({ busy: false, issue: reply?.state === 'invalid' ? reply.reason === 'invalid-input' ? 'invalid' : reply.reason
            : reply && reply.state !== 'preview' ? reply.state : matching && now !== null ? 'expired' : 'unavailable' });
    }
    async confirm(): Promise<void> { await this.complete(false); }
    async cancel(): Promise<void> { await this.complete(true); }
    private async complete(cancel: boolean): Promise<void> {
        if (this.stopped || this.value.busy || !this.pending) return;
        const record = this.pending;
        if (!cancel && !this.allowed()) { this.update({ issue: 'denied' }); return; }
        const now = this.time();
        if (!cancel && (now === null || now < record.createdAt || now >= record.plan.expiresAt)) { this.retire('expired'); return; }
        this.pending = null; const attempt: Attempt = { record, version: 0, targetCurrent: true }; this.attempt = attempt; const serial = this.serial;
        this.update({ busy: true, checking: false, canInspect: true, issue: null, review: publicPauseReview(record.plan, cancel ? 'cancelling' : 'committing') });
        if (this.stopped || serial !== this.serial || this.attempt !== attempt) return;
        if (!cancel && !this.allowed()) { this.retire(); return; }
        const response = await this.request({ method: cancel ? 'center.pauses.cancel' : 'center.pauses.confirm', operationId: record.plan.operationId, expectedRevision: record.plan.revision });
        if (this.stopped || serial !== this.serial || this.attempt !== attempt || attempt.version !== 0) return;
        this.settle(attempt, response, false);
    }
    private settle(attempt: Attempt, response: unknown, inspect: boolean): void {
        const decoded = decodePauseOutcome(response); const outcome = decoded && pauseOutcomeMatches(attempt.record.plan, decoded) ? decoded : null;
        if (inspect && this.value.review?.outcome?.state === 'unknown' && outcome?.state !== 'committed') {
            this.update({ checking: false, issue: outcome ? null : 'unavailable' }); return;
        }
        const next = phase(outcome);
        if (outcome && !['pending', 'not-submitted'].includes(outcome.state)) attempt.version++;
        const unresolved = inspect && (!outcome || outcome.state === 'pending' || outcome.state === 'not-submitted');
        this.update({ busy: unresolved ? this.value.busy : outcome?.state === 'pending' && this.value.busy, checking: false, canInspect: next === 'unknown',
            issue: outcome ? null : 'unavailable', review: { ...publicPauseReview(attempt.record.plan, next, outcome), ...(!attempt.targetCurrent ? { plan: null } : {}) } });
        try { this.observed(outcome); } catch { /* Follow-up metadata cannot erase a result. */ }
    }
    async inspect(): Promise<void> {
        if (this.stopped || this.value.checking || !this.attempt || !this.value.canInspect) return;
        const attempt = this.attempt; const version = attempt.version; this.update({ checking: true });
        if (this.stopped || this.attempt !== attempt || version !== attempt.version) return;
        const reply = await this.request({ method: 'center.pauses.result', operationId: attempt.record.plan.operationId, expectedRevision: attempt.record.plan.revision });
        if (this.stopped || this.attempt !== attempt || version !== attempt.version) return;
        this.settle(attempt, reply, true);
    }
    observeSnapshot(view: PauseReadView): void {
        const pending = this.pending; const data = view.current ? view.data : null;
        if (this.stopped || !pending || !data) return;
        if (data.loaded.state !== 'ready' || !samePauseSnapshot(pending.plan.before, data.loaded.value) || pending.plan.precautionBefore !== data.precaution) { this.retire('conflict'); return; }
        const intent = pending.intent;
        if (intent.type === 'tab' && intent.paused && (data.targets.state !== 'ready' || !data.targets.tabs.some(tab => tab.tabId === intent.tabId))) this.retire('stale');
    }
    invalidateTab(tabId: number): void {
        if (this.stopped || !natural(tabId)) return;
        if (this.pending?.plan.target.kind === 'tab' && this.pending.plan.target.tabId === tabId) { this.retire(); return; }
        const record = this.attempt?.record;
        if (record?.plan.target.kind === 'tab' && record.plan.target.tabId === tabId) {
            this.attempt!.targetCurrent = false;
            this.update({ review: { ...this.value.review!, plan: null } });
        }
    }
    async dismiss(): Promise<boolean> {
        if (this.stopped || this.value.busy) return false;
        if (this.pending) { await this.cancel(); if (this.value.busy) return false; }
        this.serial++; this.pending = null; this.attempt = null; this.update({ review: null, checking: false, canInspect: false, issue: null }); return true;
    }
    retire(issue: 'stale' | 'conflict' | 'expired' = 'stale'): void {
        if (this.stopped) return;
        this.serial++; this.pending = null; this.attempt = null; const review = this.value.review;
        this.update({ busy: false, checking: false, canInspect: false, issue: review ? issue : null, review: review ? { ...review, plan: null, phase: 'stale' } : null });
    }
    stop(): void { this.stopped = true; this.serial++; this.pending = null; this.attempt = null; this.value = deepFreeze({ review: null, busy: false, checking: false, canInspect: false, issue: null }); }
}
