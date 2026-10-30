import type { TemporaryPauseCondition } from '../domain/temporary_pause_observation.ts';

/** Worker-local precaution, separate from the browser-session document and all saved preferences. */
export class TemporaryPauseGuard {
    private readonly held = new Set<object>();
    private precaution = false;
    private witness: object = {};
    get blocked(): boolean { return this.held.size > 0 || this.precaution; }
    get uncertain(): boolean { return this.precaution; }
    get pending(): boolean { return this.held.size > 0; }
    get condition(): Exclude<TemporaryPauseCondition, 'unavailable'> {
        return this.precaution ? this.pending ? 'pending-precaution' : 'precaution' : this.pending ? 'pending' : 'clear';
    }
    capture(): object { return this.witness; }
    protect(): void { this.precaution = true; this.witness = {}; }
    hold(): object | null {
        if (this.held.size >= 16) return null;
        const token = {}; this.held.add(token); this.witness = {}; return token;
    }
    settle(token: object, uncertain: boolean): void {
        if (!this.held.delete(token)) return;
        if (uncertain) this.precaution = true;
        this.witness = {};
    }
    /** Only the reviewed same witness with no in-flight write can clear an older precaution. */
    reconcile(witness: object): boolean {
        if (this.held.size || witness !== this.witness) return false;
        this.precaution = false; this.witness = {}; return true;
    }
}
