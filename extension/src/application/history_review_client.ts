import type { CollectionAction } from '../domain/collection_review.ts';
import { decodeCollectionPreview } from '../domain/collection_reply.ts';
import { decodeJournalClearPreview } from '../domain/journal_clear_reply.ts';
import type { JournalKind } from '../domain/journal_facts.ts';
import type { HistoryFamily, HistoryPlan, HistoryReviewView } from '../domain/history_client_view.ts';
import { historyOutcome, historyOutcomeMatches, historyResultPhase, publicHistoryReview, type HistoryOutcome } from '../domain/history_review_projection.ts';
import { HISTORY_EFFECTS } from '../domain/history_protocol.ts';
import type { HistoryRequest } from '../domain/history_request.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { HistoryClientPorts } from './history_client_ports.ts';

type Review = HistoryPlan & { readonly createdAt: number };
interface Attempt { readonly record: Review; version: number }
/** One retained review. Reads never confirm, public views strip selectors, and late weaker replies cannot erase inspected facts. */
export class HistoryReviewClient {
    private pending: Review | null = null;
    private attempt: Attempt | null = null;
    private serial = 0;
    private inFlight = 0;
    private stopped = false;
    private value: HistoryReviewView = deepFreeze({ review: null, busy: false, checking: false, kind: null, issue: null });
    constructor(private readonly ports: HistoryClientPorts, private readonly observed: (plan: HistoryPlan, outcome: HistoryOutcome | null) => void) {}
    get view(): HistoryReviewView { return this.value; }
    private update(change: Partial<HistoryReviewView>): void {
        this.value = deepFreeze({ ...this.value, ...change }); try { this.ports.changed(); } catch { /* Delivery cannot change effects. */ }
    }
    private allowed(): boolean { try { return this.ports.canMutate() === true; } catch { return false; } }
    private time(): number | null { try { const value = this.ports.now(); return natural(value) ? value : null; } catch { return null; } }
    private live(record: Review): boolean { const now = this.time(); return now !== null && now >= record.createdAt && now < record.plan.expiresAt; }
    private async request(input: HistoryRequest): Promise<unknown> {
        if (this.inFlight >= (HISTORY_EFFECTS[input.method] ? 16 : 17)) return null;
        this.inFlight++;
        try { return await this.ports.request(input); } catch { return null; } finally { this.inFlight--; }
    }
    async preview(family: HistoryFamily, kind: JournalKind, action: CollectionAction = 'start'): Promise<void> {
        if (this.stopped || this.value.busy || this.value.review) return;
        if (!this.allowed()) { this.update({ kind, issue: 'denied' }); return; }
        if (this.inFlight >= 16) { this.update({ kind, issue: 'busy' }); return; }
        const serial = ++this.serial; this.update({ busy: true, kind, issue: null });
        const response = await this.request(family === 'collection' ? { method: 'center.collection.preview', kind, action } : { method: 'center.history.clear.preview', kind });
        if (this.stopped || serial !== this.serial) return;
        const value = family === 'collection' ? decodeCollectionPreview(response) : decodeJournalClearPreview(response);
        const now = this.time();
        if (value?.state === 'preview' && value.kind === kind && (family !== 'collection' || 'action' in value && value.action === action) && now !== null) {
            const record = { family, plan: value, createdAt: now } as Review;
            this.pending = record; this.attempt = null; this.update({ busy: false, review: publicHistoryReview(record, 'preview') });
        } else this.update({ busy: false, issue: value && value.state !== 'preview' ? value.state : 'unavailable' });
    }
    async confirm(): Promise<void> { await this.complete(false); }
    async cancel(): Promise<void> { await this.complete(true); }
    private async complete(cancel: boolean): Promise<void> {
        if (this.stopped || this.value.busy || !this.pending) return;
        const record = this.pending;
        if (!cancel && !this.allowed()) { this.update({ issue: 'denied' }); return; }
        if (!cancel && !this.live(record)) { this.pending = null; this.update({ review: publicHistoryReview(record, 'stale'), issue: 'expired' }); return; }
        this.pending = null; const attempt: Attempt = { record, version: 0 }; this.attempt = attempt;
        const serial = this.serial; this.update({ busy: true, checking: false, issue: null, review: publicHistoryReview(record, cancel ? 'cancelling' : 'committing') });
        const method = record.family === 'collection' ? cancel ? 'center.collection.cancel' : 'center.collection.confirm'
            : cancel ? 'center.history.clear.cancel' : 'center.history.clear.confirm';
        const response = await this.request({ method, operationId: record.plan.operationId });
        if (this.stopped || serial !== this.serial || this.attempt !== attempt || attempt.version !== 0) return;
        this.settle(attempt, response, false);
    }
    private settle(attempt: Attempt, response: unknown, inspect: boolean): void {
        const decoded = historyOutcome(attempt.record.family, response, inspect);
        const outcome = decoded && historyOutcomeMatches(attempt.record, decoded) ? decoded : null;
        // Inspection can establish a stronger clear; expiry/availability cannot erase its earlier acknowledged uncertainty.
        if (inspect && this.value.review?.outcome?.state === 'unknown' && outcome?.state !== 'observed-cleared') {
            this.update({ checking: false, issue: outcome ? null : 'unavailable' }); return;
        }
        const phase = historyResultPhase(outcome);
        if (outcome && !['pending', 'not-submitted'].includes(outcome.state)) attempt.version++;
        const unresolvedInspection = inspect && (!outcome || outcome.state === 'pending' || outcome.state === 'not-submitted');
        this.update({ busy: unresolvedInspection ? this.value.busy : outcome?.state === 'pending' && this.value.busy, checking: false,
            issue: outcome ? null : 'unavailable', review: publicHistoryReview(attempt.record, phase, outcome) });
        try { this.observed(attempt.record, outcome); } catch { /* A following refresh cannot erase a completed result. */ }
    }
    async inspect(): Promise<void> {
        if (this.stopped || this.value.checking || !this.attempt || this.value.review?.phase === 'result' || this.value.review?.phase === 'stale') return;
        const attempt = this.attempt; const version = attempt.version; this.update({ checking: true });
        const response = await this.request({ method: attempt.record.family === 'collection' ? 'center.collection.result' : 'center.history.clear.result', operationId: attempt.record.plan.operationId });
        if (this.stopped || this.attempt !== attempt || version !== attempt.version) return;
        this.settle(attempt, response, true);
    }
    async dismiss(): Promise<boolean> {
        if (this.stopped || this.value.busy) return false;
        if (this.pending) { await this.cancel(); if (this.value.busy) return false; }
        this.serial++; this.pending = null; this.attempt = null; this.update({ review: null, checking: false, issue: null }); return true;
    }
    /** Retire reusable native selectors; already observed results remain historical facts. */
    retire(): void {
        if (this.stopped) return;
        this.serial++; this.pending = null; this.attempt = null;
        const review = this.value.review;
        this.update({ busy: false, checking: false, review: review && review.phase !== 'result' ? { ...review, phase: 'stale' } : review });
    }
    stop(): void { this.stopped = true; this.serial++; this.pending = null; this.attempt = null; this.value = deepFreeze({ review: null, busy: false, checking: false, kind: null, issue: null }); }
}
