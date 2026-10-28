import { centerLocationHash, parseCenterLocation, type CenterLocation } from '../domain/center_routes.ts';
export interface CenterNavigationPort { replace(hash: string): void; changed(): void }
/** Navigation never silently drops a live draft or a review awaiting a decision. */
export class CenterNavigation {
    private value: CenterLocation;
    private pending: CenterLocation | null = null;
    private draft = false;
    private review = false;
    private committing = false;
    constructor(hash: string, private readonly port: CenterNavigationPort) { this.value = parseCenterLocation(hash) ?? { route: 'recovery' }; }
    get location(): CenterLocation { return this.value; }
    get pendingLocation(): CenterLocation | null { return this.pending; }
    get hasDraft(): boolean { return this.draft; }
    get guarded(): boolean { return this.draft || this.review || this.committing; }
    dirty(value: boolean): void { this.draft = value; }
    protect(review: boolean, committing: boolean): void { this.review = review; this.committing = committing; }
    navigate(hash: string): void {
        const next = parseCenterLocation(hash) ?? { route: 'recovery' };
        if (centerLocationHash(next) === centerLocationHash(this.value)) return;
        if (this.guarded) { this.pending = next; this.port.replace(centerLocationHash(this.value)!); }
        else { this.value = next; this.pending = null; this.port.replace(centerLocationHash(next)!); }
        this.port.changed();
    }
    stay(): void { this.pending = null; this.port.changed(); }
    leave(): void {
        if (!this.pending || this.committing) return;
        this.value = this.pending; this.pending = null; this.draft = false; this.review = false;
        this.port.replace(centerLocationHash(this.value)!); this.port.changed();
    }
}
