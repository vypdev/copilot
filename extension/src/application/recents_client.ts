import { centerDestination, decodeRecentsPermit, observedVisit, type VisitDeliveryView } from '../domain/center_visits.ts';
import type { CenterIdentity } from '../domain/center_reply.ts';
import type { HistoryMessage } from '../domain/history_protocol.ts';
import { VisitDelivery, type CapturedVisit } from './visit_delivery.ts';

export interface RecentsClientPorts {
    identity(): CenterIdentity | null; request(message: HistoryMessage): Promise<unknown>; changed(view: VisitDeliveryView): void;
}
interface Permit { readonly owner: CenterIdentity; readonly id: string; readonly epoch: number }
const same = (a: Pick<CenterIdentity, 'clientId' | 'controllerEpoch' | 'credentialEpoch'>, b: CenterIdentity | null) => b !== null
    && a.clientId === b.clientId && a.controllerEpoch === b.controllerEpoch && a.credentialEpoch === b.credentialEpoch;
const header = (owner: CenterIdentity) => ({ version: 1 as const, clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch });

/** Private capture context. A fresh metadata read can prepare future visits, never fill in an earlier missing one. */
export class RecentsClient {
    private permit: Permit | null = null;
    private epoch: number | null = null;
    private sequence = 0;
    private sequencePermit: string | null = null;
    private context = '';
    private known = false;
    private expected = false;
    private requested = false;
    private reading: Promise<void> | null = null;
    private stopped = false;
    private readonly delivery: VisitDelivery;
    constructor(private readonly ports: RecentsClientPorts) {
        this.delivery = new VisitDelivery({ request: message => this.deliver(message), changed: view => ports.changed(view),
            relevant: value => this.relevant(value), valid: value => this.relevant(value) && this.permit?.id === value.message.permit });
    }
    get view(): VisitDeliveryView { return this.delivery.view; }
    private identity(): CenterIdentity | null { try { const value = this.ports.identity(); return value ? { ...value } : null; } catch { return null; } }
    private relevant(value: CapturedVisit): boolean { return !this.stopped && this.epoch === value.epoch && same(value.message, this.identity()); }
    private owner(): CenterIdentity | null {
        const owner = this.identity(); const key = owner ? `${owner.clientId}:${owner.controllerEpoch}:${owner.credentialEpoch}` : '';
        if (key !== this.context) {
            this.context = key; this.permit = null; this.known = false; this.expected = false; this.sequence = 0; this.sequencePermit = null; this.delivery.reset();
        }
        return owner;
    }
    refresh(): Promise<void> {
        if (this.stopped) return Promise.resolve();
        this.owner();
        this.requested = true; this.reading ??= Promise.resolve().then(() => this.read()); return this.reading;
    }
    contextChanged(): void { if (!this.stopped) this.owner(); }
    private async read(): Promise<void> {
        try {
            while (this.requested && !this.stopped) {
                this.requested = false; const owner = this.owner(); if (!owner) continue;
                let body: unknown; try { body = await this.ports.request({ ...header(owner), method: 'center.recents.capture' }); } catch { body = null; }
                if (this.stopped) return;
                if (!same(owner, this.owner())) continue;
                const value = decodeRecentsPermit(body);
                if (!value || value.epoch !== null && this.epoch !== null && value.epoch < this.epoch) { this.permit = null; this.known = false; continue; }
                if (value.epoch !== null && value.epoch !== this.epoch) {
                    this.epoch = value.epoch; this.sequence = 0; this.sequencePermit = null; this.delivery.reset();
                }
                this.sequence = value.permit !== this.sequencePermit ? value.sequence : Math.max(this.sequence, value.sequence);
                this.sequencePermit = value.permit;
                this.known = true; this.expected = value.permit !== null;
                this.permit = value.permit !== null ? Object.freeze({ id: value.permit, epoch: value.epoch!, owner: { ...owner } }) : null;
            }
        } finally { this.reading = null; }
    }
    observe(location: unknown): boolean {
        if (this.stopped) return false;
        const owner = this.owner(); let destination;
        try { destination = centerDestination(location); } catch { return false; }
        if (!owner || !destination) return false;
        const permit = this.permit;
        if (!permit || !same(permit.owner, owner)) {
            if (this.expected) this.delivery.missing(); if (!this.known) void this.refresh(); return false;
        }
        if (this.sequence >= Number.MAX_SAFE_INTEGER) { this.delivery.missing(); void this.refresh(); return false; }
        this.delivery.observe({ epoch: permit.epoch, message: { ...header(owner), method: 'center.recents.observe',
            permit: permit.id, sequence: ++this.sequence, destination } });
        return true;
    }
    private async deliver(message: CapturedVisit['message']): Promise<unknown> {
        let response: unknown; try { response = await this.ports.request(message); } catch { response = null; }
        if (!this.stopped && !observedVisit(response) && same(message, this.identity()) && this.permit?.id === message.permit) {
            this.permit = null; this.known = false; void this.refresh(); // Prepare future observations; never requeue this one.
        }
        return response;
    }
    flush(): Promise<void> { return this.delivery.flush(); }
    stop(): void { this.stopped = true; this.requested = false; this.permit = null; this.delivery.stop(); }
}
