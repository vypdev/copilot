import type { TemporaryPauseCondition as NativeMutationCondition } from '../domain/temporary_pause_observation.ts';

/** One instance per native document owner. Tokens and adoption witnesses cannot cross owners. */
export class NativeMutationGuard {
    private readonly held = new Set<object>();
    private precaution = false;
    private witness: object = {};
    get blocked(): boolean { return this.held.size > 0 || this.precaution; }
    get uncertain(): boolean { return this.precaution; }
    get pending(): boolean { return this.held.size > 0; }
    get condition(): Exclude<NativeMutationCondition, 'unavailable'> {
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
    /** Only an exact reviewed witness without pending work can adopt this owner's current native state. */
    reconcile(witness: object): boolean {
        if (this.held.size || witness !== this.witness) return false;
        this.precaution = false; this.witness = {}; return true;
    }
}
