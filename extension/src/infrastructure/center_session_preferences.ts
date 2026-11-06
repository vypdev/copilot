import type { CenterClient } from '../application/center_client.ts';
import type { CenterNavigation } from '../application/center_navigation.ts';
import { SessionPreferenceClient } from '../application/session_preference_client.ts';
import type { SessionPreferenceActions } from '../domain/session_preference_ui.ts';

interface Ports { foreground(): boolean; blocked(): boolean; changed(): void; focus(): void }
/** Native route lifecycle and admission; the renderer receives callbacks and redacted views only. */
export function createCenterSessionPreferences(center: CenterClient, navigation: CenterNavigation, ports: Ports) {
    const visible = () => ports.foreground() && navigation.location.route === 'repositories' && navigation.location.detail === 'session'
        && (center.view.role === 'editor' || center.view.role === 'observer') && center.view.issue !== 'incompatible';
    const client: SessionPreferenceClient = new SessionPreferenceClient({ request: input => center.requestSessionPreferences(input), now: () => Date.now(),
        canRead: visible, canMutate: () => visible() && !ports.blocked() && center.view.role === 'editor' && !center.view.review
            && !['claiming', 'previewing', 'committing', 'stopped'].includes(center.view.phase) && client.reader.view.current
            && client.reader.view.data?.loaded.state === 'ready' && !client.reader.view.data.pending });
    const read = () => { if (visible()) void client.reader.read(); };
    const actions: SessionPreferenceActions = { read, preview: (intent, revision) => { void client.reviews.preview(intent, revision); },
        confirm: () => { void client.reviews.confirm(); }, cancel: () => { void client.reviews.cancel(); }, inspect: () => { void client.reviews.inspect(); },
        dismiss: () => { void client.reviews.dismiss(); }, dirty: value => { navigation.dirty(value); ports.changed(); } };
    let remove: (() => void) | null = null; let previous = client.view.review;
    return { client, actions, read, held: () => client.view.busy || !!client.view.review,
        contextChanged: () => { client.contextChanged(); read(); },
        start: () => { remove ??= client.subscribe(view => { ports.changed();
            if (view.review && view.review !== previous && !['committing', 'cancelling'].includes(view.review.phase)) ports.focus(); previous = view.review;
        }); }, stop: () => { remove?.(); remove = null; client.stop(); } };
}
