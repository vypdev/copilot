import { tick } from 'svelte';
import type { ClientReview } from '../domain/center_client_view.ts';

/** Review focus belongs to foreground composition, separate from rendering and mutation policy. */
export function createCenterReviewFocus(document: Document, context: () => unknown | null) {
    let previous: ClientReview | null = null;
    return {
        observe(review: ClientReview | null): void {
            if (review?.state === 'preview' && review !== previous) {
                const origin = context();
                void tick().then(() => {
                    if (origin !== null && context() === origin && previous === review) document.querySelector<HTMLElement>('#settings-review-heading')?.focus();
                });
            }
            previous = review;
        },
        complete(operation: () => Promise<void>): Promise<void> {
            const origin = context();
            return completeCenterReview(document, operation, () => origin !== null && context() === origin);
        },
    };
}

/** Keep the outcome and its next action reachable when completion retires the focused button. */
export async function completeCenterReview(document: Document, complete: () => Promise<void>, current: () => boolean): Promise<void> {
    const section = document.querySelector('section[aria-labelledby="settings-review-heading"]');
    const focused = document.activeElement;
    const foreground = () => document.hasFocus() && document.visibilityState !== 'hidden';
    const handoff = foreground() && focused instanceof HTMLElement
        && section?.contains(focused) === true && focused.matches('button:enabled');
    await complete();
    if (!handoff) return;
    await tick();
    if (!current() || !section.isConnected || !foreground()
        || (document.activeElement !== focused && document.activeElement !== document.body)
        || (focused.isConnected && !focused.matches(':disabled'))) return;
    const next = section.querySelector<HTMLButtonElement>('.actions button[aria-describedby="settings-review-status"]');
    if (next && !next.disabled) next.focus();
}
