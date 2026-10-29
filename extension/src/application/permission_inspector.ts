import { BROWSER_CAPABILITIES, EMPTY_PERMISSION_INSPECTION, UNKNOWN_PERMISSION_GRANTS,
    type BrowserCapability, type PermissionGrant, type PermissionInspection } from '../domain/permission_inspection.ts';
import { deepFreeze } from '../domain/value.ts';

export interface PermissionInspectionPorts {
    query(capability: BrowserCapability): Promise<PermissionGrant>;
    after(milliseconds: number, action: () => void): () => void;
    changed(view: PermissionInspection): void;
}
/** A UI observation only. No authorization consumer imports this reader or its results. */
export class PermissionInspector {
    private value = EMPTY_PERMISSION_INSPECTION;
    private generation = 0;
    private stopped = false;
    private waiting = false;
    private queued = false;
    private cancelDeadline: (() => void) | null = null;
    constructor(private readonly ports: PermissionInspectionPorts) {}
    get view(): PermissionInspection { return this.value; }
    private publish(value: PermissionInspection): void {
        this.value = deepFreeze(value);
        try { this.ports.changed(this.value); } catch { /* Presentation failure cannot change observed facts. */ }
    }
    invalidate(): void {
        if (this.stopped) return;
        this.generation++; this.queued = false; this.cancelDeadline?.(); this.cancelDeadline = null;
        this.publish({ ...EMPTY_PERMISSION_INSPECTION, pending: this.waiting });
    }
    read(): void {
        if (this.stopped) return;
        if (this.waiting) { this.queued = true; return; }
        void this.acquire();
    }
    private async query(capability: BrowserCapability): Promise<PermissionGrant> {
        try { return await this.ports.query(capability); } catch { return 'unknown'; }
    }
    private async acquire(): Promise<void> {
        const generation = ++this.generation; let timedOut = false;
        const current = () => !this.stopped && generation === this.generation;
        this.waiting = true; this.publish({ phase: 'checking', pending: true, grants: UNKNOWN_PERMISSION_GRANTS });
        if (!current()) {
            this.waiting = false; if (!this.stopped) this.publish({ ...this.value, pending: false }); return;
        }
        try {
            this.cancelDeadline = this.ports.after(5000, () => {
                if (!current() || !this.waiting) return;
                timedOut = true; this.publish({ phase: 'timed-out', pending: true, grants: UNKNOWN_PERMISSION_GRANTS });
            });
        } catch { this.waiting = false; this.publish(EMPTY_PERMISSION_INSPECTION); return; }
        const results = await Promise.all(BROWSER_CAPABILITIES.map(capability => this.query(capability)));
        this.cancelDeadline?.(); this.cancelDeadline = null; this.waiting = false;
        if (this.stopped) return;
        const follow = this.queued; this.queued = false; const latest = this.generation;
        if (current() && !timedOut) {
            const grants = Object.fromEntries(BROWSER_CAPABILITIES.map((capability, index) => [capability, results[index]])) as PermissionInspection['grants'];
            this.publish({ phase: 'ready', pending: false, grants });
        } else this.publish({ ...this.value, pending: false });
        if (follow && !this.stopped && !this.waiting && latest === this.generation) this.read();
    }
    stop(): void {
        this.stopped = true; this.generation++; this.queued = false;
        this.cancelDeadline?.(); this.cancelDeadline = null; this.value = EMPTY_PERMISSION_INSPECTION;
    }
}
