import type { ResourceScope } from '../../application/runtime_ports.ts';

export class BrowserResourceScope implements ResourceScope {
    readonly abort = new AbortController();
    private releases: (() => void)[] = [];
    get stopped(): boolean { return this.abort.signal.aborted; }
    constructor(private readonly valid: () => boolean) {}
    current = (): boolean => !this.stopped && this.valid();
    own = (release: () => void): void => {
        if (this.stopped) release();
        else this.releases.push(release);
    };
    dispose = (): void => {
        if (this.stopped) return;
        this.abort.abort();
        const releases = this.releases.splice(0).reverse();
        let failed = false;
        for (const release of releases) { try { release(); } catch { failed = true; } }
        if (failed) throw new Error('cleanup-failed');
    };
}
