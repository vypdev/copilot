import type { CenterClientView } from './center_client_view.ts';
import type { PermissionGrant } from './permission_inspection.ts';
import { selectedProfileContext } from './profile_context.ts';
import { deepFreeze } from './value.ts';

export type PrivacyConnection = { readonly state: 'unknown' | 'disconnected' }
    | { readonly state: 'connected'; readonly host: 'github.com'; readonly viewer: string; readonly repository: string; readonly role: 'repository-read' };
/** Restricts a presentation projection. It never grants permission to a reader or operation. */
export function privacyConnection(view: CenterClientView, nativeGrant: PermissionGrant): PrivacyConnection {
    if (view.phase !== 'ready' || view.data === null || ![null, 'invalid', 'unchanged'].includes(view.issue)
        || view.connections?.state !== 'ready') return deepFreeze({ state: 'unknown' });
    if (!view.connections.connected) return deepFreeze({ state: 'disconnected' });
    if (nativeGrant !== 'granted') return deepFreeze({ state: 'unknown' });
    const entry = selectedProfileContext(view.connections).entry;
    return entry ? deepFreeze({ state: 'connected', host: 'github.com', viewer: entry.viewerLogin, repository: entry.repository, role: 'repository-read' } as const)
        : deepFreeze({ state: 'unknown' });
}
