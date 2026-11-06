import type { CenterClient } from '../application/center_client.ts';
import type { CenterNavigation } from '../application/center_navigation.ts';
import { ApiCacheClient } from '../application/api_cache_client.ts';
import type { ApiCacheActions } from '../domain/api_cache_ui.ts';

interface Ports { foreground(): boolean; blocked(): boolean; changed(): void; focus(review: boolean): void }
/** Native route admission stays separate from the availability of saved preferences. */
export function createCenterApiCache(center: CenterClient, navigation: CenterNavigation, ports: Ports) {
    const available = () => ports.foreground() && navigation.location.route === 'privacy' && center.view.role === 'editor'
        && center.view.issue !== 'incompatible' && !['claiming', 'previewing', 'committing', 'stopped'].includes(center.view.phase);
    let previous = EMPTY_REVIEW;
    const client = new ApiCacheClient({ request: input => center.requestApiCache(input), now: () => Date.now(), canInspect: available,
        canReview: () => available() && !ports.blocked() && !navigation.hasDraft && !center.view.review,
        changed: () => { ports.changed(); const view = client.view;
            if (view.open && view.phase === 'idle' && previous !== `${view.status}/open`) ports.focus(true);
            else if (!view.open && previous.endsWith('/open')) ports.focus(false);
            previous = `${view.status}/${view.open ? 'open' : 'closed'}`;
        } });
    const actions: ApiCacheActions = { preview: () => { void client.preview(); }, confirm: () => { void client.confirm(); },
        cancel: () => { void client.cancel(); }, inspect: () => { void client.inspect(); }, dismiss: () => { void client.dismiss(); } };
    return { client, actions, contextChanged: () => client.contextChanged(), stop: () => client.stop() };
}
const EMPTY_REVIEW = 'null/closed';
