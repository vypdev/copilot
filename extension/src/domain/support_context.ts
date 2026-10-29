import type { CenterClientView } from './center_client_view.ts';
import { currentCenterSettings } from './center_client_view.ts';
import type { CenterRoute } from './center_routes.ts';
import { deepFreeze } from './value.ts';

export type SupportRoute = 'help' | 'about' | 'recovery';
export type SupportState = 'checking' | 'ready' | 'future' | 'corrupt' | 'migration-required' | 'incompatible' | 'stale' | 'unavailable';
export type SupportOperation = 'none' | 'applying' | 'unknown' | 'saved';
export interface SupportStatus { readonly state: SupportState; readonly operation: SupportOperation; readonly canRead: boolean }
export function isSupportRoute(route: CenterRoute): route is SupportRoute { return route === 'help' || route === 'about' || route === 'recovery'; }
/** A retained settings document and a saved operation are distinct facts. Neither grants editing authority. */
export function supportStatus(view: CenterClientView): SupportStatus {
    const operation = view.review?.state === 'committing' ? 'applying' : view.review?.state === 'unknown' ? 'unknown'
        : view.review?.state === 'saved' ? 'saved' : 'none';
    const state: SupportState = view.issue === 'incompatible' ? 'incompatible' : view.issue === 'stale' ? 'stale'
        : view.phase === 'loading' || view.phase === 'reading' ? 'checking'
            : view.phase === 'stopped' ? 'unavailable' : currentCenterSettings(view) ? 'ready'
                : view.issue === null && view.data && view.data.state !== 'ready' ? view.data.state : 'unavailable';
    return deepFreeze({ state, operation, canRead: view.phase === 'ready' });
}
