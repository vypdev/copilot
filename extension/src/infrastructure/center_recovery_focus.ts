import { tick } from 'svelte';
import type { CenterFrame } from '../domain/center_frame.ts';
import { centerLocationHash } from '../domain/center_routes.ts';
import type { CenterSurface } from '../presentation/center_surface.ts';

/** Preserve a read's focused control or hand it to explicit recovery, without activation. */
export function prepareCenterRecoveryFocus(root: HTMLElement | null | undefined): ((recovery?: boolean) => boolean) | null {
    if (!root) return null;
    const document = root.ownerDocument;
    const focused = document.activeElement;
    if (!document.hasFocus() || document.visibilityState === 'hidden' || !(focused instanceof HTMLElement)
        || !root.querySelector('main')?.contains(focused) || !focused.matches('button,input,select,textarea')
        || focused.matches(':disabled')) return null;
    return (recovery = true) => {
        if (!root.isConnected || !document.hasFocus() || document.visibilityState === 'hidden') return true;
        if (document.activeElement !== focused && document.activeElement !== document.body) return true;
        if (!recovery) {
            if (!focused.isConnected) return true;
            if (focused.matches(':disabled')) return false;
            if (document.activeElement !== focused) focused.focus();
            return true;
        }
        if (focused.isConnected && !focused.matches(':disabled')) return true;
        const read = root.querySelector<HTMLButtonElement>('#center-read-settings');
        if (read?.disabled) return false;
        read?.focus(); return true;
    };
}

/** Capture before rendering can disable the element; retain at most one pending handoff. */
export function subscribeCenterRecoveryFocus(surface: Pick<CenterSurface, 'initial' | 'subscribe'>,
    root: () => HTMLElement | null | undefined, publish: (frame: CenterFrame) => void): () => void {
    let current = surface.initial; let live = true; let pending: ((recovery?: boolean) => boolean) | null = null;
    const unsubscribe = surface.subscribe(value => {
        const unavailable = value.client.issue === 'unavailable';
        const reading = value.client.phase === 'reading' || value.client.phase === 'loading';
        const role = value.client.role === undefined ? value.client.data?.role : value.client.role;
        const available = value.client.phase === 'ready' && value.client.issue === null && role === 'editor';
        if ((!unavailable && !reading && !available) || centerLocationHash(value.location) !== centerLocationHash(current.location)) pending = null;
        else if (unavailable || reading) pending ??= prepareCenterRecoveryFocus(root());
        current = value; publish(value);
        if (pending && value.client.phase === 'ready') {
            const selected = pending;
            void tick().then(() => { if (live && pending === selected && current.client.phase === 'ready' && selected(current.client.issue === 'unavailable')) pending = null; });
        }
    });
    return () => { live = false; pending = null; unsubscribe(); };
}
