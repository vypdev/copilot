/** Worker-local precaution, separate from the browser-session document and all saved preferences. */
export class TemporaryPauseGuard {
    private readonly held = new Set<object>();
    private precaution = false;
    private witness: object = {};
    get blocked(): boolean { return this.held.size > 0 || this.precaution; }
    get uncertain(): boolean { return this.precaution; }
    get pending(): boolean { return this.held.size > 0; }
    capture(): object { return this.witness; }
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
