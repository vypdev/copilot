import { copySessionPreferenceReviewIntent, type SessionPreferenceReviewIntent, type SessionPreferenceReviewOutcome, type SessionPreferenceReviewPlan } from '../domain/session_preference_review.ts';
import { decodeSessionPreferenceOutcome, decodeSessionPreferencePreview, sessionPreferenceOutcomeMatches } from '../domain/session_preference_reply.ts';
import { publicSessionPreferenceReview, type SessionPreferenceReadView, type SessionPreferenceReviewView, type SessionPreferenceReviewPhase } from '../domain/session_preference_client_view.ts';
import { sameSessionPreferenceSource, sessionPreferencePreviewMatches } from '../domain/session_preference_client_match.ts';
import type { SessionPreferenceRead } from '../domain/session_preference_read.ts';
import type { SessionPreferenceRequest } from '../domain/session_preference_request.ts';
import { deepFreeze, natural } from '../domain/value.ts';
import type { SessionPreferenceClientPorts } from './session_preference_client_ports.ts';

interface Review { readonly plan: SessionPreferenceReviewPlan; readonly intent: SessionPreferenceReviewIntent; readonly read: SessionPreferenceRead; readonly createdAt: number }
interface Attempt { readonly record: Review; version: number; sourceCurrent: boolean }
function phase(value: SessionPreferenceReviewOutcome | null): SessionPreferenceReviewPhase {
    if (!value || value.state === 'pending' || value.state === 'not-submitted') return 'unknown';
    if (value.state !== 'result') return ['stale', 'expired', 'denied'].includes(value.state) ? 'stale' : 'result';
    return value.outcome.state === 'unknown' ? 'unknown' : 'current' in value.outcome && !value.outcome.current ? 'stale' : 'result';
}
/** One source-bound review. Metadata cannot certify effects; only exact operation inspection can strengthen their facts. */
export class SessionPreferenceReviewClient {
    private pending: Review | null = null;
    private attempt: Attempt | null = null;
    private serial = 0;
    private inFlight = 0;
    private stopped = false;
    private value: SessionPreferenceReviewView = deepFreeze({ review: null, busy: false, checking: false, canInspect: false, issue: null });
    constructor(private readonly ports: Omit<SessionPreferenceClientPorts, 'canRead'>,
        private readonly snapshot: () => SessionPreferenceReadView, private readonly observed: (outcome: SessionPreferenceReviewOutcome | null) => void) {}
    get view(): SessionPreferenceReviewView { return this.value; }
    private update(change: Partial<SessionPreferenceReviewView>): void {
        this.value = deepFreeze({ ...this.value, ...change }); try { this.ports.changed(); } catch { /* Rendering cannot change effects. */ }
    }
    private allowed(): boolean { try { return this.ports.canMutate() === true; } catch { return false; } }
    private time(): number | null { try { const now = this.ports.now(); return natural(now) ? now : null; } catch { return null; } }
    private async request(input: SessionPreferenceRequest): Promise<unknown> {
        this.inFlight++; try { return await this.ports.request(input); } catch { return null; } finally { this.inFlight--; }
    }
    async preview(value: unknown, expectedRevision: number): Promise<void> {
        if (this.stopped || this.value.busy || this.value.review) return;
        if (!this.allowed()) { this.update({ issue: 'denied' }); return; }
        const intent = copySessionPreferenceReviewIntent(value);
        if (!intent || !natural(expectedRevision)) { this.update({ issue: 'invalid' }); return; }
        const read = this.snapshot();
        if (!read.current || !read.data) { this.update({ issue: 'unavailable' }); return; }
        if (this.inFlight >= 16) { this.update({ issue: 'busy' }); return; }
        const serial = ++this.serial; this.update({ busy: true, issue: null });
        if (this.stopped || serial !== this.serial) return;
        if (!this.allowed()) { this.update({ busy: false, issue: 'denied' }); return; }
        const reply = decodeSessionPreferencePreview(await this.request({ method: 'center.session-preferences.preview', intent, expectedRevision }));
        if (this.stopped || serial !== this.serial) return;
        const now = this.time(); const after = this.snapshot();
        const matching = reply?.state === 'preview' && after.current && after.data && sameSessionPreferenceSource(read.data, after.data)
            && sessionPreferencePreviewMatches(reply, intent, read.data, expectedRevision) && sessionPreferencePreviewMatches(reply, intent, after.data, expectedRevision);
        if (reply?.state === 'preview' && matching && now !== null && now < reply.expiresAt) {
            this.pending = { plan: reply, intent, read: read.data, createdAt: now }; this.attempt = null;
            this.update({ busy: false, review: publicSessionPreferenceReview(reply, 'preview'), canInspect: false });
        } else this.update({ busy: false, issue: reply?.state === 'invalid' ? reply.reason === 'invalid-input' ? 'invalid' : reply.reason
            : reply && reply.state !== 'preview' ? reply.state : matching && now !== null ? 'expired' : 'unavailable' });
    }
    async confirm(): Promise<void> { await this.complete(false); }
    async cancel(): Promise<void> { await this.complete(true); }
    private async complete(cancel: boolean): Promise<void> {
        if (this.stopped || this.value.busy || !this.pending) return;
        const record = this.pending;
        if (!cancel && !this.allowed()) { this.update({ issue: 'denied' }); return; }
        const now = this.time(); const read = this.snapshot();
        if (!cancel && (!read.current || !read.data || !sameSessionPreferenceSource(record.read, read.data)
            || !sessionPreferencePreviewMatches(record.plan, record.intent, read.data, record.plan.revision))) { this.retire('conflict'); return; }
        if (!cancel && (now === null || now < record.createdAt || now >= record.plan.expiresAt)) { this.retire('expired'); return; }
        this.pending = null; const attempt: Attempt = { record, version: 0, sourceCurrent: true }; this.attempt = attempt; const serial = this.serial;
        this.update({ busy: true, checking: false, canInspect: true, issue: null, review: publicSessionPreferenceReview(record.plan, cancel ? 'cancelling' : 'committing') });
        if (this.stopped || serial !== this.serial || this.attempt !== attempt) return;
        if (!cancel && !this.allowed()) { this.retire(); return; }
        const response = await this.request({ method: cancel ? 'center.session-preferences.cancel' : 'center.session-preferences.confirm', operationId: record.plan.operationId, expectedRevision: record.plan.revision });
        if (this.stopped || serial !== this.serial || this.attempt !== attempt || attempt.version !== 0) return;
        this.settle(attempt, response, false);
    }
    private settle(attempt: Attempt, response: unknown, inspect: boolean): void {
        const decoded = decodeSessionPreferenceOutcome(response); let outcome = decoded && sessionPreferenceOutcomeMatches(attempt.record.plan, decoded) ? decoded : null;
        const previous = this.value.review?.outcome;
        if (inspect && previous?.state === 'result' && previous.outcome.state === 'unknown'
            && !(outcome?.state === 'result' && outcome.outcome.state === 'committed')) {
            this.update({ checking: false, issue: outcome ? null : 'unavailable' }); return;
        }
        // A weaker delivery cannot erase separately observed submission/acknowledgement/readback facts.
        if (previous && 'facts' in previous) {
            const facts = outcome && 'facts' in outcome ? outcome.facts : null;
            if (previous.facts.attempt === 'submitted' && facts?.attempt !== 'submitted'
                || previous.facts.acknowledgement !== null && facts?.acknowledgement !== previous.facts.acknowledgement
                || previous.facts.observation !== null && facts?.observation !== previous.facts.observation) outcome = previous;
        }
        const next = phase(outcome); if (outcome && !['pending', 'not-submitted'].includes(outcome.state)) attempt.version++;
        const unresolved = inspect && (!outcome || outcome.state === 'pending' || outcome.state === 'not-submitted');
        this.update({ busy: unresolved ? this.value.busy : decoded?.state === 'pending', checking: false, canInspect: next === 'unknown',
            issue: outcome ? null : 'unavailable', review: { ...publicSessionPreferenceReview(attempt.record.plan, next, outcome), ...(!attempt.sourceCurrent ? { plan: null } : {}) } });
        try { this.observed(outcome); } catch { /* Metadata follow-up is independent from outcome delivery. */ }
    }
    async inspect(): Promise<void> {
        if (this.stopped || this.value.checking || !this.attempt || !this.value.canInspect) return;
        const attempt = this.attempt; const version = attempt.version; this.update({ checking: true });
        if (this.stopped || this.attempt !== attempt || version !== attempt.version) return;
        const reply = await this.request({ method: 'center.session-preferences.result', operationId: attempt.record.plan.operationId, expectedRevision: attempt.record.plan.revision });
        if (this.stopped || this.attempt !== attempt || version !== attempt.version) return;
        this.settle(attempt, reply, true);
    }
    observeSnapshot(view: SessionPreferenceReadView): void {
        if (this.stopped || !view.current || !view.data) return;
        if (this.pending && (!sameSessionPreferenceSource(this.pending.read, view.data)
            || !sessionPreferencePreviewMatches(this.pending.plan, this.pending.intent, view.data, this.pending.plan.revision))) { this.retire('conflict'); return; }
        if (this.attempt?.sourceCurrent && !sameSessionPreferenceSource(this.attempt.record.read, view.data)) {
            // Retire/dismiss/stop clear the attempt together with its public review.
            this.attempt.sourceCurrent = false; this.update({ review: { ...this.value.review!, plan: null } });
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
